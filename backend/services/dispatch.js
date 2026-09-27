/**
 * Dispatch: offering a job to workers in rounds until one accepts.
 *
 * Every search runs for a fixed window (CONFIG.searchWindowMs), like a ride
 * request:
 *
 *   round 0: best CONFIG.batchSize workers within CONFIG.radiiKm[0] get an offer
 *   …CONFIG.roundIntervalMs later (or sooner, if they all decline)…
 *   round 1: next best within CONFIG.radiiKm[1], skipping anyone already offered
 *   …later rounds keep the widest radius, picking up workers who came online…
 *   at the search deadline with no taker: job → EXPIRED, and the client can
 *   retry it (same or edited details, e.g. a higher price) — see retrySearch.
 *
 * Every offer stays open until the search deadline, so a worker offered in
 * round 0 can still take the job in its last minute. Nothing is ever offered
 * after it: a worker who comes online later never sees an old job.
 *
 * If the assigned worker withdraws, or the client retries an expired job, a
 * new search starts (firstRound moves on) with a fresh window.
 *
 * Each round is a BullMQ job ("<jobId>-r<round>") run by dispatcher.js. The
 * Job document stays the source of truth: a round only acts if it can
 * atomically claim its round number, so retries and duplicates are no-ops,
 * and a job that was accepted or cancelled stops the chain by itself.
 */

const Job = require('../models/Job');
const { findCandidates, rankCandidates } = require('./matching');
const { getQueue, redisConnection, withTimeout } = require('./queue');
const { recordOffers } = require('./stats');

const QUEUE_NAME = 'dispatch';

const CONFIG = {
  searchWindowMs: 20 * 60 * 1000, // how long one search lasts before the job expires
  roundIntervalMs: 4 * 60 * 1000, // time between rounds
  batchSize: 5, // workers offered per round
  radiiKm: [3, 5, 8, 12], // search radius per round; later rounds keep the last one
  candidateLimit: 20, // nearest workers considered for ranking each round
};

function roundId(jobId, round) {
  return `${jobId}-r${round}`; // BullMQ ids can't contain ':'
}

/** A new search's deadline, starting `now`. */
function newSearchDeadline(now = Date.now()) {
  return new Date(now + CONFIG.searchWindowMs);
}

/**
 * When the job's current search ends. Jobs posted before search deadlines
 * existed count their window from when they were posted.
 */
function searchDeadline(job) {
  return job.dispatch?.searchDeadline ?? new Date(job.createdAt.getTime() + CONFIG.searchWindowMs);
}

/**
 * Workers the next round must skip: anyone who withdrew from this job, was
 * already offered it in the current search, or still holds an open offer
 * from an earlier one.
 */
function excludedWorkers(job, now = Date.now()) {
  return job.dispatch.offers
    .filter(
      (o) =>
        o.response === 'withdrawn' ||
        o.round >= job.dispatch.firstRound ||
        (o.response === null && o.expiresAt.getTime() > now)
    )
    .map((o) => o.worker);
}

/** Queues `round` of `jobId` to run after `delay` ms. No-op if already queued. */
function scheduleRound(jobId, round, delay = 0) {
  return withTimeout(
    getQueue(QUEUE_NAME).add(
      'round',
      { jobId: String(jobId), round },
      { jobId: roundId(jobId, round), delay: Math.max(0, delay) }
    )
  );
}

/** Starts dispatching a freshly posted job. */
function startDispatch(jobId) {
  return scheduleRound(jobId, 0);
}

/**
 * Runs the round after `round` now instead of waiting — used when every
 * worker in `round` has declined, and to start a new search.
 */
async function advanceNow(jobId, round) {
  const next = await withTimeout(getQueue(QUEUE_NAME).getJob(roundId(jobId, round + 1)));
  if (next && (await next.getState()) === 'delayed') {
    await next.promote();
  } else if (!next) {
    await scheduleRound(jobId, round + 1);
  }
}

/** Delay before the round after this one: the interval, cut short by the deadline. */
function nextRoundDelay(job, now = Date.now()) {
  return Math.min(CONFIG.roundIntervalMs, searchDeadline(job).getTime() - now);
}

/**
 * One dispatch round for a job. `schedule` is injectable for tests.
 * Returns what happened: 'offered' | 'empty' | 'expired' | 'stopped' | 'duplicate'.
 */
async function processRound({ jobId, round }, schedule = scheduleRound) {
  const job = await Job.findById(jobId);
  if (!job || job.status !== 'SEARCHING') return 'stopped';

  if (job.dispatch.round >= round) {
    // This round already ran (a retry, or the sweep re-adding it). Just make
    // sure the chain continues.
    if (job.dispatch.round === round) await schedule(jobId, round + 1, nextRoundDelay(job));
    return 'duplicate';
  }

  const now = Date.now();
  const deadline = searchDeadline(job);

  if (now >= deadline.getTime()) {
    const expired = await Job.findOneAndUpdate(
      { _id: jobId, status: 'SEARCHING', 'dispatch.round': job.dispatch.round },
      { status: 'EXPIRED', expiredAt: new Date(now) }
    );
    if (expired) console.log(`[dispatch] job ${jobId}: no worker before the deadline → EXPIRED`);
    // TODO(notify): tell the client no worker was found. Until then the app
    // polls the job and offers to retry it.
    return expired ? 'expired' : 'stopped';
  }

  // Rounds count from the start of the current search, so a new search
  // (worker withdrew, client retried) widens from the smallest radius again.
  const step = round - job.dispatch.firstRound;
  const radiusKm = CONFIG.radiiKm[Math.min(step, CONFIG.radiiKm.length - 1)];
  const candidates = await findCandidates(job, {
    radiusKm,
    limit: CONFIG.candidateLimit,
    exclude: excludedWorkers(job, now),
  });
  const picked = (await rankCandidates(job, candidates)).slice(0, CONFIG.batchSize);

  const offeredAt = new Date(now);
  const offers = picked.map((c) => ({
    worker: c.user,
    round,
    score: c.score,
    distanceMeters: c.distanceMeters,
    offeredAt,
    expiresAt: deadline,
  }));

  // Claim this round: fails if the job was accepted/cancelled meanwhile, or
  // another run of this round got here first.
  const claimed = await Job.updateOne(
    { _id: jobId, status: 'SEARCHING', 'dispatch.round': job.dispatch.round },
    { $set: { 'dispatch.round': round }, $push: { 'dispatch.offers': { $each: offers } } }
  );
  if (claimed.modifiedCount === 0) return 'stopped';

  console.log(
    `[dispatch] job ${jobId} round ${round} (${radiusKm} km): ` +
      `${candidates.length} candidates, offered to ${offers.length}` +
      (offers.length ? ` [${picked.map((c) => c.score.toFixed(3)).join(', ')}]` : '')
  );

  if (offers.length > 0) {
    await recordOffers(offers.map((o) => o.worker));
    // TODO(notify): push the offer to these workers. Until then the worker
    // app polls GET /api/workers/me/offers.
  }

  // The last round before the deadline is followed by the one that expires the job.
  await schedule(jobId, round + 1, nextRoundDelay(job, Date.now()));
  return offers.length > 0 ? 'offered' : 'empty';
}

/**
 * `workerId` declines their open offer for `jobId`. When everyone offered in
 * the current round has declined, the next round starts right away.
 * Returns false if there was no open offer to decline.
 */
async function declineOffer(jobId, workerId, now = new Date()) {
  const job = await Job.findOneAndUpdate(
    {
      _id: jobId,
      status: 'SEARCHING',
      'dispatch.offers': {
        $elemMatch: { worker: workerId, response: null, expiresAt: { $gt: now } },
      },
    },
    {
      $set: {
        'dispatch.offers.$.response': 'rejected',
        'dispatch.offers.$.respondedAt': now,
      },
    },
    { new: true }
  );
  if (!job) return false;

  const round = job.dispatch.round;
  const roundOffers = job.dispatch.offers.filter((o) => o.round === round);
  if (roundOffers.every((o) => o.response === 'rejected')) {
    advanceNow(job._id, round).catch((err) =>
      console.error(`Could not advance dispatch for job ${job._id}:`, err.message)
    );
  }
  return true;
}

/**
 * Update fields that put a job back to SEARCHING as a new search, after the
 * job's current round `round`. Pair with advanceNow(jobId, round) once saved.
 */
function newSearchFields(round, now = Date.now()) {
  return {
    status: 'SEARCHING',
    expiredAt: null,
    'dispatch.firstRound': round + 1,
    'dispatch.searchDeadline': newSearchDeadline(now),
  };
}

module.exports = {
  CONFIG,
  QUEUE_NAME,
  advanceNow,
  declineOffer,
  excludedWorkers,
  newSearchDeadline,
  newSearchFields,
  processRound,
  redisConnection,
  scheduleRound,
  searchDeadline,
  startDispatch,
};
