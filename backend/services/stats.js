/**
 * Incremental updates to WorkerStats. Each event is one atomic write, so
 * stats never need rebuilding and ranking always reads current numbers.
 */

const Affinity = require('../models/Affinity');
const WorkerStats = require('../models/WorkerStats');
const { indiaDay } = require('./matching');

/** Each of these workers was just offered a job. */
function recordOffers(workerIds) {
  if (workerIds.length === 0) return Promise.resolve();
  return WorkerStats.bulkWrite(
    workerIds.map((worker) => ({
      updateOne: { filter: { worker }, update: { $inc: { offersReceived: 1 } }, upsert: true },
    }))
  );
}

/** The worker accepted an offer and was assigned the job. */
function recordAcceptance(worker, now = Date.now()) {
  const day = indiaDay(now);
  // Pipeline update: every $set expression sees the document as it was
  // before the update, so the day comparison uses the old assignedDay.
  return WorkerStats.updateOne(
    { worker },
    [
      {
        $set: {
          offersAccepted: { $add: [{ $ifNull: ['$offersAccepted', 0] }, 1] },
          assignedToday: {
            $cond: [{ $eq: ['$assignedDay', day] }, { $add: ['$assignedToday', 1] }, 1],
          },
          assignedDay: day,
        },
      },
    ],
    { upsert: true }
  );
}

/** The worker accepted a job, then backed out before starting it. */
function recordWithdrawal(worker) {
  return WorkerStats.updateOne({ worker }, { $inc: { withdrawals: 1 } }, { upsert: true });
}

/**
 * The assigned worker finished `job`: counts toward their experience in the
 * category, and records that this client and worker have worked together.
 */
function recordCompletion(job) {
  return Promise.all([
    WorkerStats.updateOne(
      { worker: job.assignedWorker },
      { $inc: { completedTotal: 1, [`completedByCategory.${job.category}`]: 1 } },
      { upsert: true }
    ),
    Affinity.updateOne(
      { client: job.client, worker: job.assignedWorker },
      { $inc: { jobsTogether: 1 }, $set: { lastJobAt: job.completedAt } },
      { upsert: true }
    ),
  ]);
}

module.exports = {
  recordAcceptance,
  recordCompletion,
  recordOffers,
  recordWithdrawal,
};
