const db = require('./setup');
const Feedback = require('../models/Feedback');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const WorkerVector = require('../models/WorkerVector');
const { processRound } = require('../services/dispatch');
const { rankCandidates } = require('../services/matching');
const relevance = require('../services/relevance');
const { normalize } = require('../services/vectors');
const { createUser } = require('./helpers');

const { CONFIG, ensureJobVector, rebuildWorkerVectors } = relevance;

/**
 * Stands in for the embedding model, so tests never call Vertex: a hashed
 * bag of words, so texts sharing words are similar and others aren't.
 */
function fakeEmbedder() {
  const embed = async (texts) => {
    embed.calls += 1;
    return texts.map((text) => {
      const v = new Array(64).fill(0);
      for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
        let h = 0;
        for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 64;
        v[h] += 1;
      }
      return normalize(v);
    });
  };
  embed.calls = 0;
  return embed;
}

const HERE = { type: 'Point', coordinates: [75.8069, 26.9157] };
let client;

function postJob(description, extra = {}) {
  return Job.create({
    client: client._id,
    category: 'ac_repair',
    description,
    photos: ['https://example.com/a.jpg'],
    price: 800,
    expectedDurationMins: 60,
    location: HERE,
    clientAadhaarVerified: true,
    ...extra,
  });
}

/** A job `worker` completed, rated `rating` (null = never rated). */
async function pastJob(worker, description, rating) {
  const job = await postJob(description, {
    status: 'COMPLETED',
    assignedWorker: worker._id,
    completedAt: new Date(),
  });
  if (rating != null) {
    await Feedback.create({ job: job._id, client: client._id, worker: worker._id, category: 'ac_repair', rating });
  }
  return job;
}

const saved = { ...CONFIG };
beforeAll(async () => {
  await db.connect();
  await Promise.all([Job.init(), WorkerProfile.init(), WorkerVector.init()]);
  // The fake embedder's similarities span 0..1, unlike the real model's.
  Object.assign(CONFIG, { simFloor: 0, simCeil: 1 });
});
beforeEach(async () => {
  client = await createUser();
});
afterEach(db.clear);
afterAll(async () => {
  Object.assign(CONFIG, saved);
  await db.close();
});

describe('relevance in ranking', () => {
  test('a worker who has done this kind of job well ranks above an equal worker who has not', async () => {
    const embed = fakeEmbedder();
    const gas = await createUser();
    const installer = await createUser();
    for (const d of ['AC gas refill, cooling low', 'Gas leak fixed and AC gas refill', 'AC not cooling gas refill']) {
      await pastJob(gas, d, 5);
    }
    for (const d of ['Install new split AC on wall', 'Split AC installation with stand', 'Install window AC unit']) {
      await pastJob(installer, d, 5);
    }
    await rebuildWorkerVectors(gas._id, { embed });
    await rebuildWorkerVectors(installer._id, { embed });

    const job = await postJob('AC not cooling, needs gas refill');
    const jobVector = await ensureJobVector(job._id, { embed });
    const ranked = await rankCandidates(
      job,
      [
        { user: installer._id, distanceMeters: 1000 },
        { user: gas._id, distanceMeters: 1000 },
      ],
      Date.now(),
      { jobVector }
    );

    expect(String(ranked[0].user)).toBe(String(gas._id));
    expect(ranked[0].breakdown.relevance).toBeGreaterThan(ranked[1].breakdown.relevance);
    expect(ranked[0].breakdown.relevance).toBeGreaterThan(0.5);
  });

  test('badly rated work in a trade gives no vector, so no boost', async () => {
    const embed = fakeEmbedder();
    const worker = await createUser();
    await pastJob(worker, 'AC gas refill', 2);
    await pastJob(worker, 'AC gas refill again', 1);

    expect(await rebuildWorkerVectors(worker._id, { embed })).toBe(0);
    expect(await WorkerVector.exists({ worker: worker._id })).toBeNull();

    const job = await postJob('AC needs gas refill');
    const jobVector = await ensureJobVector(job._id, { embed });
    const [r] = await rankCandidates(job, [{ user: worker._id, distanceMeters: 1000 }], Date.now(), { jobVector });
    expect(r.breakdown.relevance).toBe(0.5);
  });

  test('a vector that turns bad is removed on rebuild', async () => {
    const embed = fakeEmbedder();
    const worker = await createUser();
    const job = await pastJob(worker, 'AC gas refill', 5);
    await rebuildWorkerVectors(worker._id, { embed });
    expect(await WorkerVector.countDocuments({ worker: worker._id })).toBe(1);

    await Feedback.updateOne({ job: job._id }, { rating: 1 });
    await rebuildWorkerVectors(worker._id, { embed });
    expect(await WorkerVector.countDocuments({ worker: worker._id })).toBe(0);
  });

  test('without a job embedding (LLM down) everyone is neutral and ranking still works', async () => {
    const worker = await createUser();
    await pastJob(worker, 'AC gas refill', 5);
    await rebuildWorkerVectors(worker._id, { embed: fakeEmbedder() });

    const job = await postJob('AC needs gas refill');
    const failing = async () => {
      throw new Error('Vertex is down');
    };
    expect(await ensureJobVector(job._id, { embed: failing })).toBeNull();

    const [r] = await rankCandidates(job, [{ user: worker._id, distanceMeters: 1000 }], Date.now(), {
      jobVector: null,
    });
    expect(r.breakdown.relevance).toBe(0.5);
  });

  test('rebuilding is idempotent and reuses stored embeddings', async () => {
    const embed = fakeEmbedder();
    const worker = await createUser();
    await pastJob(worker, 'AC gas refill', 5);
    await pastJob(worker, 'Split AC installation', 4);
    await pastJob(worker, 'AC service and cleaning', null); // unrated still counts a little

    await rebuildWorkerVectors(worker._id, { embed });
    const first = await WorkerVector.findOne({ worker: worker._id }).lean();
    await rebuildWorkerVectors(worker._id, { embed });
    const second = await WorkerVector.findOne({ worker: worker._id }).lean();

    expect(first.jobs).toBe(3);
    expect(Buffer.from(second.vector.buffer).equals(Buffer.from(first.vector.buffer))).toBe(true);
    expect(embed.calls).toBe(1); // the second rebuild embedded nothing new
  });

  test('the job embedding is computed once and stored', async () => {
    const embed = fakeEmbedder();
    const job = await postJob('AC needs gas refill');
    await ensureJobVector(job._id, { embed });
    await ensureJobVector(job._id, { embed });
    expect(embed.calls).toBe(1);
    const stored = await Job.findById(job._id).select('+embedding').lean();
    expect(stored.embedding).toBeTruthy();
    expect((await Job.findById(job._id).lean()).embedding).toBeUndefined(); // hidden by default
  });
});

describe('dispatch with relevance', () => {
  test('a round still sends offers when embedding fails', async () => {
    const worker = await createUser({ isAadhaarVerified: true });
    await WorkerProfile.create({
      user: worker._id,
      skills: ['ac_repair'],
      isOnline: true,
      lastSeenAt: new Date(),
      location: HERE,
    });
    const job = await postJob('AC needs gas refill');
    const failing = async () => {
      throw new Error('Vertex is down');
    };

    const result = await processRound({ jobId: job._id, round: 0 }, async () => {}, { embed: failing });

    expect(result).toBe('offered');
    const after = await Job.findById(job._id).lean();
    expect(after.dispatch.offers.map((o) => String(o.worker))).toEqual([String(worker._id)]);
  });

  test('a round embeds the job and uses it', async () => {
    const worker = await createUser({ isAadhaarVerified: true });
    await WorkerProfile.create({
      user: worker._id,
      skills: ['ac_repair'],
      isOnline: true,
      lastSeenAt: new Date(),
      location: HERE,
    });
    const embed = fakeEmbedder();
    const job = await postJob('AC needs gas refill');

    await processRound({ jobId: job._id, round: 0 }, async () => {}, { embed });

    expect(embed.calls).toBe(1);
    expect((await Job.findById(job._id).select('+embedding').lean()).embedding).toBeTruthy();
  });
});
