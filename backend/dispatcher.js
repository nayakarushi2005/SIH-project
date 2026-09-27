/**
 * Background process — runs the BullMQ queues:
 *   dispatch — offering jobs to workers in rounds (services/dispatch.js)
 *   graph    — updating the worker knowledge graph from feedback (services/graph.js)
 *   safety-voice — transcribing and triaging safety voice notes (services/voiceNotes.js)
 * It also closes abandoned safety shields and expires quiet SOS alerts.
 * Start alongside the API:  npm run dispatcher
 */
const path = require('path');
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Feedback = require('./models/Feedback');
const Job = require('./models/Job');
const VoiceNote = require('./models/VoiceNote');
const dispatch = require('./services/dispatch');
const graph = require('./services/graph');
const { redisConnection } = require('./services/queue');
const safety = require('./services/safety');
const voiceNotes = require('./services/voiceNotes');

const SWEEP_INTERVAL_MS = 60 * 1000;
const STALE_JOB_AFTER_MS = Math.max(60 * 1000, 2 * dispatch.CONFIG.offerTimeoutMs);
const STALE_FEEDBACK_AFTER_MS = 60 * 1000;
const STALE_VOICE_NOTE_AFTER_MS = 2 * 60 * 1000;

// Hosted Redis (Upstash) bills per command, and an idle BullMQ worker keeps
// polling. These cut idle traffic without slowing anything down: new tasks
// wake a worker immediately, and delayed rounds still fire on time —
// drainDelay only applies when nothing at all is scheduled.
const IDLE_OPTIONS = {
  drainDelay: 30, // seconds per idle poll (default 5)
  stalledInterval: 2 * 60 * 1000, // ms between stalled-task checks (default 30 s); the sweeps cover the rest
};

// Safety nets: work that lost its queue task (created while Redis was down,
// Redis restarted, …) gets re-queued. Every task is idempotent, so this is
// harmless if nothing was lost.
async function sweepStalledJobs() {
  const stalled = await Job.find({
    status: 'SEARCHING',
    updatedAt: { $lt: new Date(Date.now() - STALE_JOB_AFTER_MS) },
  })
    .select('_id dispatch.round')
    .limit(100);

  for (const job of stalled) {
    await dispatch.scheduleRound(job._id, job.dispatch.round + 1);
  }
  if (stalled.length > 0) console.log(`[dispatcher] sweep re-queued ${stalled.length} job(s)`);
}

async function sweepUnprocessedFeedback() {
  const pending = await Feedback.find({
    processedAt: null,
    createdAt: { $lt: new Date(Date.now() - STALE_FEEDBACK_AFTER_MS) },
  })
    .select('_id')
    .limit(100);

  for (const feedback of pending) {
    await graph.enqueueFeedback(feedback._id);
  }
  if (pending.length > 0) console.log(`[dispatcher] sweep re-queued ${pending.length} feedback`);
}

async function sweepPendingVoiceNotes() {
  const pending = await VoiceNote.find({
    'analysis.status': 'pending',
    createdAt: { $lt: new Date(Date.now() - STALE_VOICE_NOTE_AFTER_MS) },
  })
    .select('_id')
    .limit(100);

  for (const note of pending) {
    await voiceNotes.enqueueVoiceNote(note._id);
  }
  if (pending.length > 0) console.log(`[dispatcher] sweep re-queued ${pending.length} voice note(s)`);
}

async function sweepSafety() {
  const closed = await safety.closeQuietSessions();
  const expired = await safety.expireQuietAlerts();
  if (closed > 0) console.log(`[dispatcher] closed ${closed} abandoned safety shield(s)`);
  if (expired > 0) console.log(`[dispatcher] expired ${expired} quiet SOS alert(s)`);
}

// The last retry failing marks the note failed, so the sweep doesn't retry it forever.
async function analyzeVoiceNote(task) {
  try {
    await voiceNotes.analyzeVoiceNote(task.data.noteId);
  } catch (err) {
    if (task.attemptsMade + 1 >= (task.opts.attempts ?? 1)) {
      await voiceNotes.markAnalysisFailed(task.data.noteId, err.message);
    }
    throw err;
  }
}

function startWorker(name, processor, concurrency) {
  const worker = new Worker(name, processor, {
    connection: redisConnection({ maxRetriesPerRequest: null }), // required by BullMQ workers
    concurrency,
    ...IDLE_OPTIONS,
  });
  worker.on('ready', () => console.log(`🚚 Listening on the "${name}" queue`));
  worker.on('failed', (task, err) => console.error(`[${name}] task ${task?.id} failed:`, err.message));
  worker.on('error', (err) => console.error(`[${name}] worker error:`, err.message));
  return worker;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Dispatcher connected to MongoDB');

  const workers = [
    startWorker(dispatch.QUEUE_NAME, (task) => dispatch.processRound(task.data), 10),
    startWorker(graph.QUEUE_NAME, (task) => graph.processFeedback(task.data.feedbackId), 5),
    startWorker(voiceNotes.QUEUE_NAME, analyzeVoiceNote, 3),
  ];

  const sweep = async () => {
    try {
      await sweepStalledJobs();
      await sweepUnprocessedFeedback();
      await sweepPendingVoiceNotes();
      await sweepSafety();
    } catch (err) {
      console.error('[dispatcher] sweep error (will retry):', err.message);
    }
  };
  sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(timer);
    await Promise.all(workers.map((w) => w.close()));
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Dispatcher failed to start:', err.message);
  process.exit(1);
});
