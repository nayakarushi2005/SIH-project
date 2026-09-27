const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const GovOfficial = require('../models/GovOfficial');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const { CELL_DEG, clearCache } = require('../services/heatmap');
const { generateAccessToken } = require('../utils/tokenUtils');
const { createUser, authHeader } = require('./helpers');

beforeAll(async () => {
  await db.connect();
  await Promise.all([Job.syncIndexes(), WorkerProfile.syncIndexes()]); // 2dsphere
});
afterEach(async () => {
  await db.clear();
  clearCache();
  delete process.env.HEATMAP_MIN_COUNT;
});
afterAll(db.close);

// Mumbai, and a spot ~3 km north-east of it.
const HERE = { lat: 19.076, lng: 72.8777 };
const THERE = { lat: 19.1, lng: 72.9 };
const DAY = 24 * 60 * 60 * 1000;

// Points spread a few metres apart, all inside one grid cell.
const jitter = (p, i) => ({ lat: p.lat + i * 0.00001, lng: p.lng + i * 0.00001 });

async function jobsAt(client, p, n, over = {}) {
  const docs = Array.from({ length: n }, (_, i) => {
    const { lat, lng } = jitter(p, i);
    return {
      client: client._id,
      category: 'plumber',
      description: 'Fix a leaking tap in the kitchen',
      photos: ['https://example.com/photo.jpg'],
      price: 500,
      expectedDurationMins: 60,
      location: { type: 'Point', coordinates: [lng, lat] },
      clientAadhaarVerified: true,
      status: 'COMPLETED',
      ...over,
    };
  });
  await Job.insertMany(docs);
}

async function onlineWorkersAt(p, n, over = {}) {
  for (let i = 0; i < n; i += 1) {
    const user = await createUser({ isWorker: true });
    const { lat, lng } = jitter(p, i);
    await WorkerProfile.create({
      user: user._id,
      skills: ['plumber'],
      isOnline: true,
      lastSeenAt: new Date(),
      location: { type: 'Point', coordinates: [lng, lat] },
      ...over,
    });
  }
}

const q = (p) => `lat=${p.lat}&lng=${p.lng}`;

/** Every coordinate in a response must be a grid-cell centre. */
function expectOnlyCellCentres(cells) {
  for (const c of cells) {
    for (const v of [c.lat, c.lng]) {
      const k = v / CELL_DEG - 0.5;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  }
}

describe('GET /api/heatmap/demand', () => {
  test('buckets jobs into cells, counts EXPIRED as unfilled, and returns only cell centres', async () => {
    const client = await createUser();
    const worker = await createUser({ isWorker: true, worker: { categories: ['plumber'] } });
    await jobsAt(client, HERE, 3);
    await jobsAt(client, HERE, 2, { status: 'EXPIRED' });
    await jobsAt(client, THERE, 2);

    const res = await request(app).get(`/api/heatmap/demand?${q(HERE)}`).set(authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body.cells).toHaveLength(2);
    const here = res.body.cells.find((c) => Math.abs(c.lat - HERE.lat) < CELL_DEG);
    expect(here).toMatchObject({ jobs: 5, unfilled: 2 });
    expect(res.body.summary).toMatchObject({ jobs: 7, unfilled: 2, avgPrice: 500 });
    expectOnlyCellCentres(res.body.cells);
  });

  test('a cell with a single job is never shown, but still counts in the summary', async () => {
    const client = await createUser();
    const worker = await createUser({ isWorker: true, worker: { categories: ['plumber'] } });
    await jobsAt(client, HERE, 1);

    const res = await request(app).get(`/api/heatmap/demand?${q(HERE)}`).set(authHeader(worker));
    expect(res.body.cells).toEqual([]);
    expect(res.body.summary.jobs).toBe(1);
  });

  test('defaults to the worker’s skills; ?category and the window narrow it', async () => {
    const client = await createUser();
    const worker = await createUser({ isWorker: true });
    await WorkerProfile.create({ user: worker._id, skills: ['plumber'] });
    await jobsAt(client, HERE, 2);
    await jobsAt(client, HERE, 3, { category: 'electrician' });
    await jobsAt(client, THERE, 2, { createdAt: new Date(Date.now() - 20 * DAY) });

    const mine = await request(app).get(`/api/heatmap/demand?${q(HERE)}&window=7d`).set(authHeader(worker));
    expect(mine.body.summary.jobs).toBe(2);

    const month = await request(app).get(`/api/heatmap/demand?${q(HERE)}&window=30d`).set(authHeader(worker));
    expect(month.body.summary.jobs).toBe(4);

    const elec = await request(app).get(`/api/heatmap/demand?${q(HERE)}&category=electrician`).set(authHeader(worker));
    expect(elec.body.summary.jobs).toBe(3);
  });

  test('cancelled jobs and jobs far away are not demand', async () => {
    const client = await createUser();
    const worker = await createUser({ isWorker: true, worker: { categories: ['plumber'] } });
    await jobsAt(client, HERE, 2, { status: 'CANCELLED' });
    await jobsAt(client, { lat: 18.52, lng: 73.85 }, 2); // Pune, ~120 km away

    const res = await request(app).get(`/api/heatmap/demand?${q(HERE)}`).set(authHeader(worker));
    expect(res.body.summary.jobs).toBe(0);
  });

  test('is for workers only, and needs a valid location', async () => {
    const client = await createUser();
    const denied = await request(app).get(`/api/heatmap/demand?${q(HERE)}`).set(authHeader(client));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('heatmap_workers_only');

    const worker = await createUser({ isWorker: true });
    const bad = await request(app).get('/api/heatmap/demand?lat=abc&lng=1').set(authHeader(worker));
    expect(bad.status).toBe(400);
  });
});

describe('GET /api/heatmap/availability', () => {
  test('counts online, recently seen workers with the skill; ignores offline and stale ones', async () => {
    const client = await createUser();
    await onlineWorkersAt(HERE, 3);
    await onlineWorkersAt(HERE, 2, { isOnline: false });
    await onlineWorkersAt(HERE, 2, { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) });
    await onlineWorkersAt(HERE, 2, { skills: ['electrician'] });

    const res = await request(app).get(`/api/heatmap/availability?${q(HERE)}&category=plumber`).set(authHeader(client));
    expect(res.status).toBe(200);
    expect(res.body.summary.workersOnline).toBe(3);
    expect(res.body.cells).toEqual([expect.objectContaining({ workers: 3 })]);
    expectOnlyCellCentres(res.body.cells);
  });

  test('a lone worker is counted but not placed on the map', async () => {
    const client = await createUser();
    await onlineWorkersAt(HERE, 1);
    const res = await request(app).get(`/api/heatmap/availability?${q(HERE)}`).set(authHeader(client));
    expect(res.body.summary.workersOnline).toBe(1);
    expect(res.body.cells).toEqual([]);
  });

  test('typical wait is the median minutes from posting to a worker accepting', async () => {
    const client = await createUser();
    const now = Date.now();
    for (const mins of [4, 6, 30]) {
      await jobsAt(client, HERE, 1, {
        createdAt: new Date(now - DAY),
        assignedAt: new Date(now - DAY + mins * 60000),
      });
    }
    const res = await request(app).get(`/api/heatmap/availability?${q(HERE)}&category=plumber`).set(authHeader(client));
    expect(res.body.summary.typicalWaitMins).toBe(6);
  });
});

describe('GET /api/heatmap/gov', () => {
  const bounds = 'sw=19.0,72.8&ne=19.2,73.0';

  async function official() {
    const gov = await GovOfficial.create({ googleId: 'g-gov', email: 'gov@example.gov.in', name: 'Officer' });
    return { Authorization: `Bearer ${generateAccessToken(gov._id, 'GovOfficial')}` };
  }

  test('merges demand and supply per cell and ranks categories by unfilled rate', async () => {
    const client = await createUser();
    await jobsAt(client, HERE, 4);
    await jobsAt(client, HERE, 2, { status: 'EXPIRED' });
    await jobsAt(client, THERE, 3, { category: 'electrician', status: 'EXPIRED' });
    await onlineWorkersAt(HERE, 2);

    const res = await request(app).get(`/api/heatmap/gov?${bounds}`).set(await official());
    expect(res.status).toBe(200);
    const here = res.body.cells.find((c) => Math.abs(c.lat - HERE.lat) < CELL_DEG);
    expect(here).toMatchObject({ jobs: 6, unfilled: 2, workers: 2, shortage: 3 });
    expect(res.body.categories.map((c) => c.category)).toEqual(['electrician', 'plumber']);
    expect(res.body.categories[0]).toMatchObject({ jobs: 3, unfilled: 3, unfilledRate: 1, workers: 0 });
    expect(res.body.summary).toMatchObject({ jobs: 9, unfilled: 5, workers: 2 });
    expectOnlyCellCentres(res.body.cells);
  });

  test('only government officials can see it', async () => {
    const worker = await createUser({ isWorker: true });
    const appToken = await request(app).get(`/api/heatmap/gov?${bounds}`).set(authHeader(worker));
    expect(appToken.status).toBe(403);

    const fedToken = { Authorization: `Bearer ${generateAccessToken(worker._id, 'Federation')}` };
    const fed = await request(app).get(`/api/heatmap/gov?${bounds}`).set(fedToken);
    expect(fed.status).toBe(403);
  });

  test('bounds must be valid and no bigger than a city', async () => {
    const auth = await official();
    const bad = await request(app).get('/api/heatmap/gov?sw=19.2,72.8&ne=19.0,73.0').set(auth);
    expect(bad.body.code).toBe('heatmap_bounds_invalid');
    const huge = await request(app).get('/api/heatmap/gov?sw=10,70&ne=20,80').set(auth);
    expect(huge.body.code).toBe('heatmap_area_too_large');
  });
});
