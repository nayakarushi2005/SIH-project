/**
 * Shared BullMQ plumbing for the background queues (dispatch, graph).
 * Queues are processed by dispatcher.js.
 */

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const ENQUEUE_TIMEOUT_MS = 3000;

function redisConnection(options = {}) {
  return new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', options);
}

const queues = new Map();

/** The producer side of queue `name`, created on first use. */
function getQueue(name) {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      // Fail fast instead of queueing commands while Redis is down, so an API
      // request never hangs on it — dispatcher.js sweeps up anything missed.
      connection: redisConnection({ enableOfflineQueue: false }),
      defaultJobOptions: {
        // Safe to drop: every task is idempotent against MongoDB, so re-adding
        // a finished task id is harmless.
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
    queue.on('error', (err) => console.error(`[${name}] queue error:`, err.message));
    queues.set(name, queue);
  }
  return queues.get(name);
}

/** Rejects if `promise` hasn't settled within `ms` — Redis being unreachable. */
function withTimeout(promise, ms = ENQUEUE_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Redis did not respond')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = {
  getQueue,
  redisConnection,
  withTimeout,
};
