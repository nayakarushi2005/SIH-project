/**
 * Dispatch: offering a job to workers in rounds until one accepts.
 *
 *   round 0: best CONFIG.batchSize workers within CONFIG.radiiKm[0] get an offer
 *   …wait CONFIG.offerTimeoutMs (or less, if they all decline)…
 *   round 1: next best within CONFIG.radiiKm[1], skipping anyone already offered
 *   …
 *   after the last round with no taker: job → EXPIRED
 *
 * If the assigned worker withdraws before starting, the job goes back to
 * SEARCHING and the chain resumes with a fresh set of rounds (firstRound).
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
  // How long workers get to answer an offer. Service jobs aren't ride-hailing:
  // a worker may be finishing another job, so they get time to respond. With
  // 6 rounds, a job nobody takes keeps searching for up to 2 hours.
  offerTimeoutMs: 20 * 60 * 1000,
  batchSize: 5, // workers offered per round
  radiiKm: [3, 5, 8, 12, 12, 12], // search radius per round; its length = number of rounds
  candidateLimit: 20, // nearest workers considered for ranking each round
};

function roundId(jobId, round) {
  return `${jobId}-r${round}`; // BullMQ ids can't contain ':'
}

/** Queues `round` of `jobId` to run after `delay` ms. No-op if already queued. */
function scheduleRound(jobId, round, delay = 0) {
  return withTimeout(
    getQueue(QUEUE_NAME).add(
      'round',
      { jobId: String(jobId), round },
      { jobId: roundId(jobId, round), delay }
    )
  );
}

/** Starts dispatching a freshly posted job. */
function startDispatch(jobId) {
  return scheduleRound(jobId, 0);
}

/**
 * Runs the round after `round` now instead of waiting out the timeout — used
 * when every worker in `round` has declined.
 */
async function advanceNow(jobId, round) {
  const next = await withTimeout(getQueue(QUEUE_NAME).getJob(roundId(jobId, round + 1)));
  if (next && (await next.getState()) === 'delayed') {
    await next.promote();
  } else if (!next) {
    await scheduleRound(jobId, round + 1);
  }
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
    if (job.dispatch.round === round) await schedule(jobId, round + 1, CONFIG.offerTimeoutMs);
    return 'duplicate';
  }

  // Rounds count from the start of the current search, so a job put back in
  // the queue (its worker withdrew) gets the full widening search again.
  const step = round - job.dispatch.firstRound;

  if (step >= CONFIG.radiiKm.length) {
    const expired = await Job.findOneAndUpdate(
      { _id: jobId, status: 'SEARCHING', 'dispatch.round': job.dispatch.round },
      { status: 'EXPIRED', expiredAt: new Date() }
    );
    if (expired) console.log(`[dispatch] job ${jobId}: no worker after ${step} rounds → EXPIRED`);
    // TODO(notify): tell the client no worker was found.
    return expired ? 'expired' : 'stopped';
  }

  const radiusKm = CONFIG.radiiKm[step];
  const alreadyOffered = job.dispatch.offers.map((o) => o.worker);
  const candidates = await findCandidates(job, {
    radiusKm,
    limit: CONFIG.candidateLimit,
    exclude: alreadyOffered,
  });
  const picked = (await rankCandidates(job, candidates)).slice(0, CONFIG.batchSize);

  const offeredAt = new Date();
  const expiresAt = new Date(offeredAt.getTime() + CONFIG.offerTimeoutMs);
  const offers = picked.map((c) => ({
    worker: c.user,
    round,
    score: c.score,
    distanceMeters: c.distanceMeters,
    offeredAt,
    expiresAt,
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

  await schedule(jobId, round + 1, CONFIG.offerTimeoutMs);
  return offers.length > 0 ? 'offered' : 'empty';
}

module.exports = {
  CONFIG,
  QUEUE_NAME,
  advanceNow,
  processRound,
  redisConnection,
  scheduleRound,
  startDispatch,
};
