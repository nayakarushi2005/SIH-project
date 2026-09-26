/**
 * The worker knowledge graph (see models/GraphEdge.js), built from feedback.
 *
 * Feedback lands via POST /api/jobs/:id/feedback, which only saves it and
 * queues a "graph" task. dispatcher.js runs processFeedback() in the
 * background, which rebuilds the affected nodes' edges from *all* of their
 * feedback. Rebuilding (rather than incrementing) makes every run
 * idempotent — retries, duplicates and the sweep are all harmless — and a
 * change to the scoring below is applied by simply reprocessing.
 *
 * Ranking (services/matching.js) reads the resulting edges; later, the
 * NEEDS_IMPROVEMENT edges are what free government courses get matched to.
 */

const Affinity = require('../models/Affinity');
const Feedback = require('../models/Feedback');
const GraphEdge = require('../models/GraphEdge');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const WorkerStats = require('../models/WorkerStats');
const llm = require('./llm');
const { PRIORS } = require('./matching');
const { getQueue, withTimeout } = require('./queue');
const { extractRelations } = require('./relations');

const QUEUE_NAME = 'graph';

// ── Tuning ──────────────────────────────────────────────────────────────────
const HALF_LIFE_DAYS = 180; // feedback counts half as much after ~6 months
const TRAIT_PRIOR = 2; // a trait score needs a few mentions to move far from 0
const GAP_THRESHOLD = -0.2; // trait score at or below this…
const GAP_MIN_MENTIONS = 2; // …with at least this many criticisms = needs improvement
const SKILL_FULL_AT = 20; // completed jobs in a trade for full experience
const SKILL_GAP_MAX_RATING = 3; // average rating in a trade at or below this…
const SKILL_GAP_MIN_RATINGS = 2; // …over at least this many ratings = needs improvement
const CRITICISM_WEIGHT = 2; // a client's complaints say more about what they value than praise
const SPECIALTY_FULL_AT = 5; // jobs showing a specialty for full weight
// ────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function recency(date, now) {
  return 0.5 ** ((now - new Date(date).getTime()) / (HALF_LIFE_DAYS * DAY_MS));
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/**
 * A feedback's traits: the client's chips plus what the LLM read in their
 * comment. The chips are the client's explicit answer, so they win conflicts.
 */
function traitsOf(f) {
  const praised = new Set(f.praised);
  const criticized = new Set(f.criticized);
  for (const t of f.extracted?.praised ?? []) if (!criticized.has(t)) praised.add(t);
  for (const t of f.extracted?.criticized ?? []) if (!praised.has(t)) criticized.add(t);
  return { praised: [...praised], criticized: [...criticized] };
}

/**
 * Makes `edges` the complete set of `rels` edges out of one node: upserts
 * them and deletes any of those rels that no longer apply.
 */
async function replaceEdges(fromType, fromId, rels, edges) {
  const key = (e) => `${e.rel}|${e.toType}|${e.toId}`;
  if (edges.length > 0) {
    await GraphEdge.bulkWrite(
      edges.map((e) => ({
        updateOne: {
          filter: { fromType, fromId, rel: e.rel, toType: e.toType, toId: e.toId },
          update: { $set: { weight: e.weight, evidence: e.evidence, props: e.props ?? {} } },
          upsert: true,
        },
      }))
    );
  }
  const keep = new Set(edges.map(key));
  const existing = await GraphEdge.find({ fromType, fromId, rel: { $in: rels } })
    .select('rel toType toId')
    .lean();
  const stale = existing.filter((e) => !keep.has(key(e))).map((e) => e._id);
  if (stale.length > 0) await GraphEdge.deleteMany({ _id: { $in: stale } });
}

/** Rebuilds a worker's ratings, traits and skills from all feedback about them. */
async function rebuildWorker(workerId, now = Date.now()) {
  const id = String(workerId);
  const [feedback, stats, profile] = await Promise.all([
    Feedback.find({ worker: workerId }).lean(),
    WorkerStats.findOne({ worker: workerId }).lean(),
    WorkerProfile.findOne({ user: workerId }).select('skills').lean(),
  ]);

  // Overall rating — ranking's Bayesian rating reads these.
  await WorkerStats.updateOne(
    { worker: workerId },
    {
      $set: {
        ratingSum: feedback.reduce((sum, f) => sum + f.rating, 0),
        ratingCount: feedback.length,
      },
    },
    { upsert: true }
  );

  const edges = [];

  // Traits: praise and criticism of the same trait net out; recent counts more.
  const tally = {};
  const entry = (trait) => (tally[trait] ??= { pos: 0, neg: 0, praised: 0, criticized: 0 });
  for (const f of feedback) {
    const w = recency(f.createdAt, now);
    const { praised, criticized } = traitsOf(f);
    for (const t of praised) {
      entry(t).pos += w;
      entry(t).praised += 1;
    }
    for (const t of criticized) {
      entry(t).neg += w;
      entry(t).criticized += 1;
    }
  }
  for (const [trait, t] of Object.entries(tally)) {
    const score = (t.pos - t.neg) / (t.pos + t.neg + TRAIT_PRIOR); // -1..1
    const props = { praised: t.praised, criticized: t.criticized, score: round3(score) };
    if (score > 0) {
      edges.push({ rel: 'HAS_TRAIT', toType: 'trait', toId: trait, weight: round3(score), evidence: t.praised + t.criticized, props });
    } else if (score <= GAP_THRESHOLD && t.criticized >= GAP_MIN_MENTIONS) {
      edges.push({ rel: 'NEEDS_IMPROVEMENT', toType: 'trait', toId: trait, weight: round3(-score), evidence: t.criticized, props });
    }
  }

  // Skills: declared trades, proven by completed jobs and the ratings in them.
  const completed = stats?.completedByCategory ?? {};
  const categories = new Set([...(profile?.skills ?? []), ...Object.keys(completed), ...feedback.map((f) => f.category)]);
  for (const category of categories) {
    const jobs = completed[category] ?? 0;
    const ratings = feedback.filter((f) => f.category === category).map((f) => f.rating);
    const ratingSum = ratings.reduce((a, b) => a + b, 0);
    const bayes = (PRIORS.rating * PRIORS.ratingWeight + ratingSum) / (PRIORS.ratingWeight + ratings.length);
    const avgRating = ratings.length ? round3(ratingSum / ratings.length) : null;
    const level = 0.5 * Math.min(jobs / SKILL_FULL_AT, 1) + 0.5 * ((bayes - 1) / 4); // 0..1
    const props = { jobs, ratings: ratings.length, avgRating, declared: !!profile?.skills?.includes(category) };

    edges.push({ rel: 'HAS_SKILL', toType: 'skill', toId: category, weight: round3(level), evidence: jobs, props });
    if (ratings.length >= SKILL_GAP_MIN_RATINGS && avgRating <= SKILL_GAP_MAX_RATING) {
      edges.push({
        rel: 'NEEDS_IMPROVEMENT',
        toType: 'skill',
        toId: category,
        weight: round3(Math.min((SKILL_GAP_MAX_RATING + 0.5 - avgRating) / 2.5, 1)),
        evidence: ratings.length,
        props,
      });
    }
  }

  // Specialties: specific work the LLM found in their jobs, e.g. "geyser repair".
  const specialties = {};
  for (const f of feedback) {
    for (const s of f.extracted?.specialties ?? []) {
      const entry = (specialties[s] ??= { jobs: 0, categories: new Set() });
      entry.jobs += 1;
      entry.categories.add(f.category);
    }
  }
  for (const [specialty, s] of Object.entries(specialties)) {
    edges.push({
      rel: 'HAS_SPECIALTY',
      toType: 'specialty',
      toId: specialty,
      weight: round3(Math.min(s.jobs / SPECIALTY_FULL_AT, 1)),
      evidence: s.jobs,
      props: { categories: [...s.categories] },
    });
  }

  await replaceEdges('worker', id, ['HAS_TRAIT', 'NEEDS_IMPROVEMENT', 'HAS_SKILL', 'HAS_SPECIALTY'], edges);
}

/** Rebuilds what a client cares about from the feedback they've given. */
async function rebuildClient(clientId, now = Date.now()) {
  const feedback = await Feedback.find({ client: clientId }).lean();

  const values = {};
  const mentions = {};
  for (const f of feedback) {
    const w = recency(f.createdAt, now);
    const { praised, criticized } = traitsOf(f);
    for (const t of praised) values[t] = (values[t] ?? 0) + w;
    for (const t of criticized) values[t] = (values[t] ?? 0) + CRITICISM_WEIGHT * w;
    for (const t of [...praised, ...criticized]) mentions[t] = (mentions[t] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(values));
  const edges = Object.entries(values).map(([trait, v]) => ({
    rel: 'VALUES',
    toType: 'trait',
    toId: trait,
    weight: round3(v / max),
    evidence: mentions[trait],
  }));

  await replaceEdges('client', String(clientId), ['VALUES'], edges);
}

/** Rebuilds the client↔worker edge (Affinity) from their feedback together. */
async function rebuildPair(clientId, workerId) {
  const feedback = await Feedback.find({ client: clientId, worker: workerId }).sort({ createdAt: 1 }).lean();
  const latest = feedback[feedback.length - 1];
  await Affinity.updateOne(
    { client: clientId, worker: workerId },
    {
      $set: {
        ratingSum: feedback.reduce((sum, f) => sum + f.rating, 0),
        ratingCount: feedback.length,
        // The most recent answer is the client's current opinion.
        rehire: latest?.rehire ?? null,
        blocked: !!latest?.block,
      },
    },
    { upsert: true }
  );
}

/**
 * Runs LLM extraction for a feedback that hasn't had it yet, and stores the
 * result. Never throws: if the LLM is down, the graph is still built from
 * the client's chips, and `npm run graph:reprocess` retries later.
 */
async function extractOnce(feedback, extract) {
  if (!extract || feedback.extracted) return;
  try {
    const job = await Job.findById(feedback.job).select('category description').lean();
    const extracted = await extract(feedback, job);
    await Feedback.updateOne({ _id: feedback._id }, { extracted, extractionError: null });
    feedback.extracted = extracted;
  } catch (err) {
    console.error(`[graph] LLM extraction failed for feedback ${feedback._id}:`, err.message);
    await Feedback.updateOne({ _id: feedback._id }, { extractionError: err.message.slice(0, 300) });
  }
}

/**
 * Background task: apply one piece of feedback to the graph.
 * options.extract — relation extractor; defaults to the LLM when it's
 * configured (injectable for tests, null to skip).
 */
async function processFeedback(feedbackId, { extract = llm.isConfigured() ? extractRelations : null } = {}) {
  const feedback = await Feedback.findById(feedbackId).lean();
  if (!feedback) return 'missing';

  await extractOnce(feedback, extract);
  await rebuildWorker(feedback.worker);
  await rebuildClient(feedback.client);
  await rebuildPair(feedback.client, feedback.worker);
  await Feedback.updateOne({ _id: feedback._id }, { processedAt: new Date() });

  console.log(`[graph] feedback ${feedbackId}: rebuilt worker ${feedback.worker} and client ${feedback.client}`);
  return 'processed';
}

/** Queues feedback for processFeedback. No-op if already queued. */
function enqueueFeedback(feedbackId) {
  return withTimeout(
    getQueue(QUEUE_NAME).add('feedback', { feedbackId: String(feedbackId) }, { jobId: `feedback-${feedbackId}` })
  );
}

/**
 * A worker's view of their own graph: rating, strengths, areas to improve and
 * trade levels. The `improve` list is what course recommendations will use.
 */
async function workerInsights(workerId) {
  const [edges, stats] = await Promise.all([
    GraphEdge.find({ fromType: 'worker', fromId: String(workerId) }).lean(),
    WorkerStats.findOne({ worker: workerId }).lean(),
  ]);
  const byWeight = (a, b) => b.weight - a.weight || a.toId.localeCompare(b.toId); // stable order on ties

  return {
    rating: {
      average: stats?.ratingCount ? round3(stats.ratingSum / stats.ratingCount) : null,
      count: stats?.ratingCount ?? 0,
    },
    completedJobs: stats?.completedTotal ?? 0,
    strengths: edges
      .filter((e) => e.rel === 'HAS_TRAIT')
      .sort(byWeight)
      .map((e) => ({ trait: e.toId, score: e.weight, mentions: e.evidence })),
    improve: edges
      .filter((e) => e.rel === 'NEEDS_IMPROVEMENT')
      .sort(byWeight)
      .map((e) => ({ type: e.toType, id: e.toId, score: e.weight, mentions: e.evidence })),
    skills: edges
      .filter((e) => e.rel === 'HAS_SKILL')
      .sort(byWeight)
      .map((e) => ({ skill: e.toId, level: e.weight, jobs: e.props?.jobs ?? 0, avgRating: e.props?.avgRating ?? null })),
    specialties: edges
      .filter((e) => e.rel === 'HAS_SPECIALTY')
      .sort(byWeight)
      .map((e) => ({ specialty: e.toId, jobs: e.evidence })),
  };
}

module.exports = {
  QUEUE_NAME,
  enqueueFeedback,
  processFeedback,
  rebuildWorker,
  workerInsights,
};
