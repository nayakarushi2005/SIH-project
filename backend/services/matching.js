/**
 * Matching a job to workers, in two stages:
 *   1. findCandidates — who *can* take this job: online, free, right skill,
 *      close enough. One geo query, cheap enough to run on every dispatch.
 *   2. rankCandidates — who *should* get it first, from precomputed worker
 *      stats and client↔worker history. Nothing expensive runs here; the
 *      knowledge graph is built elsewhere and only its results are read.
 */

const Affinity = require('../models/Affinity');
const GraphEdge = require('../models/GraphEdge');
const WorkerProfile = require('../models/WorkerProfile');
const WorkerStats = require('../models/WorkerStats');
const { PRESENCE_TTL_MS } = require('./workerProfile');

// ── Tuning ──────────────────────────────────────────────────────────────────
// Signal weights (each signal is 0..1; affinity and traits can go to -1). Sum to 1.
const WEIGHTS = {
  distance: 0.25,
  rating: 0.2,
  experience: 0.15,
  affinity: 0.15,
  reliability: 0.15,
  traits: 0.1, // knowledge graph: the worker's traits vs. what this client values
};

// Nudges on top of the weighted sum, to spread work fairly.
const ADJUSTMENTS = {
  newcomerBoost: 0.05, // until a worker has NEWCOMER_JOBS completed jobs
  perJobTodayPenalty: 0.03, // per job already assigned today…
  maxTodayPenalty: 0.12, // …capped here
};

// What we assume about a worker before we know anything. Few data points
// stay close to these; lots of data outweighs them (Bayesian averaging).
const PRIORS = {
  rating: 4.0,
  ratingWeight: 5, // "worth" 5 ratings
  acceptance: 0.8,
  acceptanceWeight: 5, // "worth" 5 offers
};

const DISTANCE_ZERO_KM = 10; // distance score falls linearly to 0 here
const EXPERIENCE_FULL_AT = 20; // completed jobs in the category for full score
const NEWCOMER_JOBS = 3;

// ────────────────────────────────────────────────────────────────────────────

/**
 * Nearest available workers for `job`, closest first.
 * options.radiusKm  — search radius around the job (the dispatcher widens it
 *                     on later rounds)
 * options.limit     — how many candidates to return
 * options.exclude   — User ids to skip, e.g. workers already offered the job
 * Returns plain objects: WorkerProfile fields plus `distanceMeters`.
 */
async function findCandidates(job, { radiusKm = 5, limit = 20, exclude = [] } = {}) {
  const seenSince = new Date(Date.now() - PRESENCE_TTL_MS);

  return WorkerProfile.aggregate([
    {
      $geoNear: {
        near: job.location,
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: {
          isActive: true,
          isOnline: true,
          currentJob: null,
          skills: job.category,
          lastSeenAt: { $gte: seenSince },
          user: { $nin: [job.client, ...exclude] }, // never offer clients their own job
        },
      },
    },
    // Respect each worker's own travel limit, not just the search radius.
    {
      $match: {
        $expr: { $lte: ['$distanceMeters', { $multiply: ['$serviceRadiusKm', 1000] }] },
      },
    },
    { $limit: limit },
  ]);
}

/** Today's date in India as YYYY-MM-DD — the day boundary for "jobs today". */
function indiaDay(now = Date.now()) {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clamp01(x) {
  return Math.min(Math.max(x, 0), 1);
}

/** Past work with this client: -1 (won't rehire) … 1 (would rehire). */
function affinityScore(a) {
  if (!a) return 0;
  if (a.rehire === false) return -1;
  if (a.rehire === true) return 1;
  if (a.ratingCount > 0) return 0.8 * (a.ratingSum / a.ratingCount / 5);
  return a.jobsTogether > 0 ? 0.5 : 0;
}

/**
 * How well a worker's traits (trait → -1..1) fit a client: weighted by what
 * the client values when we know that, otherwise the worker's general trait
 * reputation. -1..1; 0 when there's nothing to go on.
 */
function traitFit(workerTraits, clientValues) {
  const valued = Object.entries(clientValues);
  if (valued.length > 0) {
    const total = valued.reduce((sum, [, w]) => sum + w, 0);
    return valued.reduce((sum, [t, w]) => sum + w * (workerTraits[t] ?? 0), 0) / total;
  }
  const scores = Object.values(workerTraits);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

/**
 * Scores and sorts candidates for `job`, best first. Drops workers the
 * client has blocked. Each result gets `score` and a `breakdown` of the
 * signals behind it.
 */
async function rankCandidates(job, candidates, now = Date.now()) {
  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.user);
  const [stats, affinities, traitEdges, valueEdges] = await Promise.all([
    WorkerStats.find({ worker: { $in: ids } }).lean(),
    Affinity.find({ client: job.client, worker: { $in: ids } }).lean(),
    GraphEdge.find({
      fromType: 'worker',
      fromId: { $in: ids.map(String) },
      rel: { $in: ['HAS_TRAIT', 'NEEDS_IMPROVEMENT'] },
      toType: 'trait',
    }).lean(),
    GraphEdge.find({ fromType: 'client', fromId: String(job.client), rel: 'VALUES' }).lean(),
  ]);
  const statsByWorker = new Map(stats.map((s) => [String(s.worker), s]));
  const affinityByWorker = new Map(affinities.map((a) => [String(a.worker), a]));
  const traitsByWorker = new Map();
  for (const e of traitEdges) {
    const traits = traitsByWorker.get(e.fromId) ?? {};
    traits[e.toId] = e.rel === 'HAS_TRAIT' ? e.weight : -e.weight;
    traitsByWorker.set(e.fromId, traits);
  }
  const clientValues = Object.fromEntries(valueEdges.map((e) => [e.toId, e.weight]));
  const today = indiaDay(now);

  return candidates
    .filter((c) => !affinityByWorker.get(String(c.user))?.blocked)
    .map((c) => {
      const s = statsByWorker.get(String(c.user)) ?? {};
      const ratingSum = s.ratingSum ?? 0;
      const ratingCount = s.ratingCount ?? 0;
      const offersReceived = s.offersReceived ?? 0;
      // Backing out after accepting counts against a worker like an ignored offer.
      const offersKept = (s.offersAccepted ?? 0) - (s.withdrawals ?? 0);

      const signals = {
        distance: clamp01(1 - c.distanceMeters / (DISTANCE_ZERO_KM * 1000)),
        rating:
          (PRIORS.rating * PRIORS.ratingWeight + ratingSum) /
          (PRIORS.ratingWeight + ratingCount) /
          5,
        experience: clamp01((s.completedByCategory?.[job.category] ?? 0) / EXPERIENCE_FULL_AT),
        affinity: affinityScore(affinityByWorker.get(String(c.user))),
        reliability: clamp01(
          (PRIORS.acceptance * PRIORS.acceptanceWeight + offersKept) /
            (PRIORS.acceptanceWeight + offersReceived)
        ),
        traits: traitFit(traitsByWorker.get(String(c.user)) ?? {}, clientValues),
      };

      const adjustments = {};
      if ((s.completedTotal ?? 0) < NEWCOMER_JOBS) {
        adjustments.newcomer = ADJUSTMENTS.newcomerBoost;
      }
      const jobsToday = s.assignedDay === today ? s.assignedToday : 0;
      if (jobsToday > 0) {
        adjustments.busyToday = -Math.min(
          jobsToday * ADJUSTMENTS.perJobTodayPenalty,
          ADJUSTMENTS.maxTodayPenalty
        );
      }

      const score =
        Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * signals[k], 0) +
        Object.values(adjustments).reduce((sum, v) => sum + v, 0);

      return { ...c, score, breakdown: { ...signals, ...adjustments } };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  PRIORS,
  findCandidates,
  indiaDay,
  rankCandidates,
};
