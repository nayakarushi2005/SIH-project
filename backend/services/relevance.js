/**
 * "Has this worker done work like this, and done it well?" — the relevance
 * signal in ranking (services/matching.js), from text embeddings.
 *
 *   - A job's description is embedded once, by the dispatcher, before its
 *     first ranking (ensureJobVector).
 *   - Each worker has one vector per trade: the rating- and recency-weighted
 *     average of the jobs they completed in it (rebuildWorkerVectors, run
 *     with the knowledge graph after feedback). Badly rated work doesn't
 *     count, so it never attracts more of the same.
 *   - Ranking compares the two with a dot product. Only the ≤20 workers the
 *     geo query already found are compared, so no vector index is needed.
 *
 * Everything degrades to "no opinion" (relevance 0.5): no LLM configured, the
 * embedding call failing, or a worker with no rated history yet.
 */

const Category = require('../models/Category');
const Feedback = require('../models/Feedback');
const Job = require('../models/Job');
const WorkerVector = require('../models/WorkerVector');
const llm = require('./llm');
const { dot, fromBuffer, toBuffer, weightedMean } = require('./vectors');

// ── Tuning ──────────────────────────────────────────────────────────────────
const CONFIG = {
  // Similarity → 0..1 score: at or below simFloor is "unrelated work", at or
  // above simCeil is "the same kind of job". From scripts/relevance-check.js
  // with gemini-embedding-001: different work in one trade ≈ 0.80–0.85, the
  // same kind of job ≈ 0.89–0.97 (Hindi ↔ English included). Recheck these
  // if EMBEDDING_MODEL changes.
  simFloor: 0.8,
  simCeil: 0.92,
  evidencePrior: 3, // with n jobs behind a vector, trust it n / (n + 3)
  maxJobsPerCategory: 100, // most recent completed jobs a vector is built from
  embedTimeoutMs: 5000, // dispatch never waits longer than this on the LLM
};
const HALF_LIFE_DAYS = 180; // same as the knowledge graph (services/graph.js)
const RATING_FACTOR = { 1: 0, 2: 0, 3: 0.3, 4: 0.7, 5: 1 }; // how much a job shows the worker's craft
const UNRATED_FACTOR = 0.5; // completed, but the client never rated it
// ────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** The LLM's embed() when it's configured, else null (relevance stays neutral). */
function defaultEmbedder() {
  return llm.isConfigured() ? llm.embed : null;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function recency(date, now) {
  return 0.5 ** ((now - new Date(date).getTime()) / (HALF_LIFE_DAYS * DAY_MS));
}

/** English category names by slug, so "ac_repair" reads as "AC Repair" to the model. */
async function categoryNames(slugs) {
  const categories = await Category.find({ slug: { $in: [...new Set(slugs)] } }).select('slug names.en').lean();
  return new Map(categories.map((c) => [c.slug, c.names?.en ?? c.slug]));
}

function jobText(job, names) {
  return `${names.get(job.category) ?? job.category}: ${job.description}`;
}

/**
 * The job's embedding, computing and storing it on first use. Returns null
 * (and logs) when it can't — ranking then runs without relevance.
 * options.embed — injectable for tests; null skips embedding.
 */
async function ensureJobVector(jobId, { embed = defaultEmbedder() } = {}) {
  const job = await Job.findById(jobId).select('+embedding category description').lean();
  if (!job) return null;
  if (job.embedding) return fromBuffer(job.embedding);
  if (!embed) return null;

  try {
    const [vector] = await withTimeout(
      embed([jobText(job, await categoryNames([job.category]))]),
      CONFIG.embedTimeoutMs
    );
    await Job.updateOne({ _id: jobId }, { embedding: toBuffer(vector) });
    return vector;
  } catch (err) {
    console.error(`[relevance] embedding job ${jobId} failed:`, err.message);
    return null;
  }
}

/**
 * Rebuilds a worker's per-trade vectors from their completed jobs, embedding
 * any job that doesn't have an embedding yet. Idempotent: the result depends
 * only on the jobs and their feedback.
 * options.embed — injectable for tests; null uses only stored embeddings.
 */
async function rebuildWorkerVectors(workerId, { embed = defaultEmbedder(), now = Date.now() } = {}) {
  const [jobs, feedback] = await Promise.all([
    Job.find({ assignedWorker: workerId, status: 'COMPLETED' })
      .select('+embedding category description completedAt')
      .sort({ completedAt: -1 })
      .lean(),
    Feedback.find({ worker: workerId }).select('job rating').lean(),
  ]);

  // The latest jobs per trade.
  const byCategory = new Map();
  for (const job of jobs) {
    const list = byCategory.get(job.category) ?? [];
    if (list.length < CONFIG.maxJobsPerCategory) list.push(job);
    byCategory.set(job.category, list);
  }
  const recent = [...byCategory.values()].flat();

  // Embed the ones we haven't yet, in one go.
  const missing = recent.filter((j) => !j.embedding);
  if (missing.length > 0 && embed) {
    try {
      const names = await categoryNames(missing.map((j) => j.category));
      const vectors = await embed(missing.map((j) => jobText(j, names)));
      await Job.bulkWrite(
        missing.map((j, i) => ({
          updateOne: { filter: { _id: j._id }, update: { $set: { embedding: toBuffer(vectors[i]) } } },
        }))
      );
      missing.forEach((j, i) => {
        j.vector = vectors[i];
      });
    } catch (err) {
      console.error(`[relevance] embedding jobs of worker ${workerId} failed:`, err.message);
    }
  }

  const ratingByJob = new Map(feedback.map((f) => [String(f.job), f.rating]));
  const weightOf = (job) => {
    const rating = ratingByJob.get(String(job._id));
    const factor = rating == null ? UNRATED_FACTOR : RATING_FACTOR[rating] ?? 0;
    return factor * recency(job.completedAt ?? now, now);
  };

  const docs = [];
  for (const [category, list] of byCategory) {
    const usable = list
      .map((job) => ({ vector: job.vector ?? fromBuffer(job.embedding), weight: weightOf(job) }))
      .filter((x) => x.vector && x.weight > 0);
    const vector = weightedMean(
      usable.map((x) => x.vector),
      usable.map((x) => x.weight)
    );
    if (vector) docs.push({ category, vector, jobs: usable.length });
  }

  if (docs.length > 0) {
    await WorkerVector.bulkWrite(
      docs.map((d) => ({
        updateOne: {
          filter: { worker: workerId, category: d.category },
          update: { $set: { vector: toBuffer(d.vector), jobs: d.jobs } },
          upsert: true,
        },
      }))
    );
  }
  // Trades with nothing usable left (e.g. only badly rated work) lose their vector.
  await WorkerVector.deleteMany({ worker: workerId, category: { $nin: docs.map((d) => d.category) } });
  return docs.length;
}

/**
 * Workers' vectors for one trade, as Map(workerId → { vector, jobs }).
 */
async function workerVectors(workerIds, category) {
  const docs = await WorkerVector.find({ worker: { $in: workerIds }, category }).lean();
  return new Map(docs.map((d) => [String(d.worker), { vector: fromBuffer(d.vector), jobs: d.jobs }]));
}

/**
 * 0..1: how close the job is to the work the worker has done well, pulled
 * toward 0.5 when there's little history behind it. 0.5 without vectors.
 */
function relevanceScore(jobVector, workerVector) {
  if (!jobVector || !workerVector) return 0.5;
  const sim = dot(jobVector, workerVector.vector);
  const raw = Math.min(Math.max((sim - CONFIG.simFloor) / (CONFIG.simCeil - CONFIG.simFloor), 0), 1);
  const trust = workerVector.jobs / (workerVector.jobs + CONFIG.evidencePrior);
  return 0.5 + (raw - 0.5) * trust;
}

module.exports = {
  CONFIG,
  defaultEmbedder,
  ensureJobVector,
  rebuildWorkerVectors,
  relevanceScore,
  workerVectors,
};
