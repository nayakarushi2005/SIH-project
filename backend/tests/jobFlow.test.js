const request = require('supertest');

// No Redis in tests: queue calls resolve without doing anything.
jest.mock('../services/queue', () => {
  const queue = { add: jest.fn(async () => ({})), getJob: jest.fn(async () => null) };
  return {
    getQueue: () => queue,
    redisConnection: jest.fn(),
    withTimeout: (p) => p,
  };
});

const db = require('./setup');
const app = require('../app');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const WorkerStats = require('../models/WorkerStats');
const { CONFIG, processRound } = require('../services/dispatch');
const { WORKER_CANCEL_WINDOW_MS } = require('../services/job');
const { createUser, authHeader } = require('./helpers');

const HERE = [72.8, 19.1];
const MIN = 60 * 1000;

beforeAll(async () => {
  await db.connect();
  await Promise.all([Job.syncIndexes(), WorkerProfile.syncIndexes()]);
});
afterEach(db.clear);
afterAll(db.close);

function makeJob(overrides = {}) {
  return Job.create({
    category: 'plumber',
    description: 'Fix a leaking tap in the kitchen',
    photos: ['https://example.com/photo.jpg'],
    price: 500,
    expectedDurationMins: 60,
    location: { type: 'Point', coordinates: HERE },
    clientAadhaarVerified: true,
    ...overrides,
    dispatch: { searchDeadline: new Date(Date.now() + CONFIG.searchWindowMs), ...overrides.dispatch },
  });
}

async function makeWorker(overrides = {}) {
  const user = await createUser({ name: 'Ravi Kumar', phone: '9876543210', isAadhaarVerified: true });
  await WorkerProfile.create({
    user: user._id,
    skills: ['plumber'],
    isOnline: true,
    lastSeenAt: new Date(),
    location: { type: 'Point', coordinates: HERE },
    ...overrides,
  });
  return user;
}

function openOffer(worker, round = 0, expiresAt = new Date(Date.now() + 10 * MIN)) {
  return { worker: worker._id, round, offeredAt: new Date(), expiresAt };
}

describe('dispatch rounds', () => {
  test('offers stay open until the search deadline, and the next round is scheduled within it', async () => {
    const client = await createUser();
    const worker = await makeWorker();
    const job = await makeJob({ client: client._id });
    const schedule = jest.fn();

    expect(await processRound({ jobId: job._id, round: 0 }, schedule)).toBe('offered');

    const saved = await Job.findById(job._id);
    expect(saved.dispatch.offers).toHaveLength(1);
    expect(String(saved.dispatch.offers[0].worker)).toBe(String(worker._id));
    expect(saved.dispatch.offers[0].expiresAt.getTime()).toBe(saved.dispatch.searchDeadline.getTime());
    const [, nextRound, delay] = schedule.mock.calls[0];
    expect(nextRound).toBe(1);
    expect(delay).toBeLessThanOrEqual(CONFIG.roundIntervalMs);
  });

  test('a round after the deadline expires the job instead of offering it', async () => {
    const client = await createUser();
    await makeWorker();
    const job = await makeJob({ client: client._id, dispatch: { searchDeadline: new Date(Date.now() - 1000) } });

    expect(await processRound({ jobId: job._id, round: 0 }, jest.fn())).toBe('expired');

    const saved = await Job.findById(job._id);
    expect(saved.status).toBe('EXPIRED');
    expect(saved.dispatch.offers).toHaveLength(0);
  });

  test('a worker is not offered the same job twice in one search, nor after withdrawing', async () => {
    const client = await createUser();
    const rejected = await makeWorker();
    const withdrew = await makeWorker();
    const job = await makeJob({
      client: client._id,
      dispatch: {
        round: 0,
        firstRound: 0,
        offers: [
          { ...openOffer(rejected), response: 'rejected' },
          { ...openOffer(withdrew), response: 'withdrawn' },
        ],
      },
    });

    expect(await processRound({ jobId: job._id, round: 1 }, jest.fn())).toBe('empty');
  });
});

describe('POST /api/jobs/:id/accept', () => {
  test('two workers accepting at once: exactly one gets the job, and it leaves the other’s offers', async () => {
    const client = await createUser();
    const a = await makeWorker();
    const b = await makeWorker();
    const job = await makeJob({
      client: client._id,
      dispatch: { round: 0, offers: [openOffer(a), openOffer(b)] },
    });

    const [ra, rb] = await Promise.all([
      request(app).post(`/api/jobs/${job._id}/accept`).set(authHeader(a)),
      request(app).post(`/api/jobs/${job._id}/accept`).set(authHeader(b)),
    ]);

    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 200 ? b : a;
    const winner = ra.status === 200 ? a : b;
    const saved = await Job.findById(job._id);
    expect(String(saved.assignedWorker)).toBe(String(winner._id));

    const offers = await request(app).get('/api/workers/me/offers').set(authHeader(loser));
    expect(offers.body).toEqual([]);
    // The loser is free for other jobs.
    expect((await WorkerProfile.findOne({ user: loser._id })).currentJob).toBeNull();
  });

  test('the worker gets a cancellation deadline; the client gets the worker’s details', async () => {
    const client = await createUser();
    const worker = await makeWorker({ experienceYears: 6 });
    await WorkerStats.create({ worker: worker._id, ratingSum: 9, ratingCount: 2, completedTotal: 2 });
    const job = await makeJob({ client: client._id, dispatch: { round: 0, offers: [openOffer(worker)] } });

    const accepted = await request(app).post(`/api/jobs/${job._id}/accept`).set(authHeader(worker));
    expect(accepted.status).toBe(200);
    const window = new Date(accepted.body.cancelDeadline) - new Date(accepted.body.assignedAt);
    expect(window).toBe(WORKER_CANCEL_WINDOW_MS);
    expect(accepted.body.worker).toBeNull();

    const seen = await request(app).get(`/api/jobs/${job._id}`).set(authHeader(client));
    expect(seen.body.worker).toMatchObject({
      name: 'Ravi Kumar',
      phoneMasked: '98XXXXXX10',
      aadhaarVerified: true,
      rating: { average: 4.5, count: 2 },
      completedJobs: 2,
      experienceYears: 6,
    });
    expect(seen.body.worker.phone).toBeUndefined();
    expect(JSON.stringify(seen.body)).not.toContain('9876543210');
    expect(seen.body.cancelDeadline).toBeNull();
  });
});

describe('POST /api/jobs/:id/withdraw', () => {
  async function assigned(assignedAt, extra = {}) {
    const client = await createUser();
    const worker = await makeWorker();
    const job = await makeJob({
      client: client._id,
      status: 'ASSIGNED',
      assignedWorker: worker._id,
      assignedAt,
      startCode: '1234',
      dispatch: { round: 2, offers: [{ ...openOffer(worker, 2), response: 'accepted' }] },
      ...extra,
    });
    await WorkerProfile.updateOne({ user: worker._id }, { currentJob: job._id });
    return { job, worker };
  }

  test('needs a reason', async () => {
    const { job, worker } = await assigned(new Date());
    const res = await request(app).post(`/api/jobs/${job._id}/withdraw`).set(authHeader(worker)).send({});
    expect(res.status).toBe(400);
    expect(res.body.fieldCodes).toEqual({ reason: 'job_withdraw_reason_required' });

    const other = await request(app)
      .post(`/api/jobs/${job._id}/withdraw`)
      .set(authHeader(worker))
      .send({ reason: 'other' });
    expect(other.body.fieldCodes).toEqual({ note: 'job_withdraw_note_required' });
  });

  test('within the window: back to searching with a fresh deadline, reason kept', async () => {
    const { job, worker } = await assigned(new Date(Date.now() - MIN));
    const res = await request(app)
      .post(`/api/jobs/${job._id}/withdraw`)
      .set(authHeader(worker))
      .send({ reason: 'emergency' });
    expect(res.status).toBe(204);

    const saved = await Job.findById(job._id);
    expect(saved.status).toBe('SEARCHING');
    expect(saved.assignedWorker).toBeNull();
    expect(saved.dispatch.firstRound).toBe(3);
    expect(saved.dispatch.searchDeadline.getTime()).toBeGreaterThan(Date.now() + CONFIG.searchWindowMs - MIN);
    expect(saved.dispatch.offers[0]).toMatchObject({ response: 'withdrawn', withdrawReason: 'emergency' });
    expect((await WorkerProfile.findOne({ user: worker._id })).currentJob).toBeNull();
  });

  test('after the window: refused', async () => {
    const { job, worker } = await assigned(new Date(Date.now() - WORKER_CANCEL_WINDOW_MS - MIN));
    const res = await request(app)
      .post(`/api/jobs/${job._id}/withdraw`)
      .set(authHeader(worker))
      .send({ reason: 'too_far' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('job_withdraw_window_over');
    expect((await Job.findById(job._id)).status).toBe('ASSIGNED');
  });

  test('after the window but locked out by wrong start codes: allowed', async () => {
    const { job, worker } = await assigned(new Date(Date.now() - 30 * MIN), { startCodeAttempts: 5 });
    const res = await request(app)
      .post(`/api/jobs/${job._id}/withdraw`)
      .set(authHeader(worker))
      .send({ reason: 'client_unreachable' });
    expect(res.status).toBe(204);
  });
});

describe('POST /api/jobs/:id/retry', () => {
  test('an expired job searches again, with a new price and deadline', async () => {
    const client = await createUser();
    const job = await makeJob({
      client: client._id,
      status: 'EXPIRED',
      expiredAt: new Date(),
      dispatch: { round: 4, searchDeadline: new Date(Date.now() - MIN) },
    });

    const res = await request(app).post(`/api/jobs/${job._id}/retry`).set(authHeader(client)).send({ price: 700 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SEARCHING');
    expect(res.body.price).toBe(700);
    expect(new Date(res.body.searchDeadline).getTime()).toBeGreaterThan(Date.now());
    const saved = await Job.findById(job._id);
    expect(saved.dispatch.firstRound).toBe(5);
    expect(saved.expiredAt).toBeNull();
  });

  test('rejects invalid edits, and jobs that aren’t expired', async () => {
    const client = await createUser();
    const expired = await makeJob({ client: client._id, status: 'EXPIRED' });
    const bad = await request(app).post(`/api/jobs/${expired._id}/retry`).set(authHeader(client)).send({ price: 5 });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldCodes).toEqual({ price: 'job_price_range' });

    const searching = await makeJob({ client: client._id });
    const res = await request(app).post(`/api/jobs/${searching._id}/retry`).set(authHeader(client)).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('job_cannot_retry');
  });
});

describe('worker availability', () => {
  test('going offline declines open offers, and an offline worker is shown none', async () => {
    const client = await createUser();
    const worker = await makeWorker();
    const job = await makeJob({ client: client._id, dispatch: { round: 0, offers: [openOffer(worker)] } });

    const before = await request(app).get('/api/workers/me/offers').set(authHeader(worker));
    expect(before.body).toHaveLength(1);

    await request(app).post('/api/workers/me/offline').set(authHeader(worker)).expect(200);

    const saved = await Job.findById(job._id);
    expect(saved.dispatch.offers[0].response).toBe('rejected');
    // Coming back online doesn't bring the old offer back.
    await WorkerProfile.updateOne({ user: worker._id }, { isOnline: true, lastSeenAt: new Date() });
    const after = await request(app).get('/api/workers/me/offers').set(authHeader(worker));
    expect(after.body).toEqual([]);
  });

  test('the profile keeps the worker’s online choice when heartbeats lapse', async () => {
    const worker = await makeWorker({ lastSeenAt: new Date(Date.now() - 60 * MIN) });
    const res = await request(app).get('/api/workers/me').set(authHeader(worker));
    expect(res.body).toMatchObject({ isOnline: true, isPresent: false });
  });
});
