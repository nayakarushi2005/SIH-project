const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const verifyToken = require('../middleware/verifyToken');
const { advanceNow, startDispatch } = require('../services/dispatch');
const { validateFeedback } = require('../services/feedback');
const { enqueueFeedback } = require('../services/graph');
const { toJob, validateNewJob } = require('../services/job');
const {
  recordAcceptance,
  recordCompletion,
  recordWithdrawal,
} = require('../services/stats');

const router = express.Router();

const MAX_START_CODE_ATTEMPTS = 5;

/** 4-digit code the client reads out to the worker on arrival. */
function newStartCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

/** Frees the worker to receive offers again, if they're still on this job. */
function releaseWorker(workerId, jobId) {
  return WorkerProfile.updateOne({ user: workerId, currentJob: jobId }, { currentJob: null });
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs
// Posts a new job. Photos must already be uploaded via /api/uploads.
// Requires: valid app JWT
// Body: { category, description, photos: [url], price, expectedDurationMins,
//         location: { lat, lng }, address? }
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const user = req.user;
  const { job: fields, errors } = await validateNewJob(user, req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  try {
    const job = await Job.create({
      ...fields,
      client: user._id,
      clientAadhaarVerified: user.isAadhaarVerified,
    });

    // If Redis is unreachable the job is still saved; the dispatcher's sweep
    // starts it once the queue is back.
    startDispatch(job._id).catch((err) =>
      console.error(`Dispatch start failed for job ${job._id}:`, err.message)
    );

    return res.status(201).json(toJob(job, user._id));
  } catch (err) {
    console.error('Job create error:', err.message);
    return res.status(500).json({ error: 'Could not post your job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/jobs
// Lists the current user's posted jobs, newest first.
// ────────────────────────────────────────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const jobs = await Job.find({ client: req.user._id }).sort({ createdAt: -1 }).limit(50);
    return res.status(200).json(jobs.map((job) => toJob(job, req.user._id)));
  } catch (err) {
    console.error('Job list error:', err.message);
    return res.status(500).json({ error: 'Could not load your jobs.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/jobs/:id
// A job the current user posted, or was assigned as the worker.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    const job = await Job.findOne({
      _id: req.params.id,
      $or: [{ client: req.user._id }, { assignedWorker: req.user._id }],
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.status(200).json(toJob(job, req.user._id));
  } catch (err) {
    console.error('Job fetch error:', err.message);
    return res.status(500).json({ error: 'Could not load the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/cancel
// Cancels a job that hasn't started yet. The status check is part of the
// update so a cancel can't race a worker accepting or starting the job.
// 409 → the job has already started or finished
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const owned = { _id: req.params.id, client: req.user._id };

  try {
    const job = await Job.findOneAndUpdate(
      { ...owned, status: { $in: ['SEARCHING', 'ASSIGNED'] } },
      { status: 'CANCELLED', cancelledAt: new Date() },
      { new: true }
    );

    if (!job) {
      const exists = await Job.exists(owned);
      return exists
        ? res.status(409).json({ error: 'This job can no longer be cancelled.' })
        : res.status(404).json({ error: 'Job not found' });
    }

    // Pending offers die with the job: the dispatcher and the offers list
    // both only look at SEARCHING jobs. An assigned worker is freed up.
    if (job.assignedWorker) {
      await releaseWorker(job.assignedWorker, job._id);
      // TODO(notify): tell the assigned worker the job was cancelled.
    }

    return res.status(200).json(toJob(job, req.user._id));
  } catch (err) {
    console.error('Job cancel error:', err.message);
    return res.status(500).json({ error: 'Could not cancel the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/accept
// A worker accepts an offer they received. First valid accept wins: the
// worker is claimed (one active job at a time), then the job is claimed with
// a single conditional update, so two workers can never both get it.
// 409 → the job was taken/cancelled, the offer expired, or the worker is busy
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/accept', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const me = req.user._id;
  const jobId = new mongoose.Types.ObjectId(String(req.params.id));
  const now = new Date();

  try {
    const worker = await WorkerProfile.findOneAndUpdate(
      { user: me, isActive: true, currentJob: null },
      { currentJob: jobId }
    );
    if (!worker) {
      const registered = await WorkerProfile.exists({ user: me });
      return registered
        ? res.status(409).json({ error: 'Finish your current job before accepting another.' })
        : res.status(403).json({ error: 'Not registered as a worker' });
    }

    const job = await Job.findOneAndUpdate(
      {
        _id: jobId,
        status: 'SEARCHING',
        'dispatch.offers': {
          $elemMatch: { worker: me, response: null, expiresAt: { $gt: now } },
        },
      },
      {
        $set: {
          status: 'ASSIGNED',
          assignedWorker: me,
          assignedAt: now,
          startCode: newStartCode(),
          startCodeAttempts: 0,
          'dispatch.offers.$.response': 'accepted',
          'dispatch.offers.$.respondedAt': now,
        },
      },
      { new: true }
    );

    if (!job) {
      await releaseWorker(me, jobId);
      return res.status(409).json({ error: 'This job is no longer available.' });
    }

    recordAcceptance(me).catch((err) => console.error('Stats update failed:', err.message));
    // TODO(notify): tell the client a worker is coming, and the other offered
    // workers that the job is gone.

    return res.status(200).json(toJob(job, req.user._id));
  } catch (err) {
    console.error('Job accept error:', err.message);
    await releaseWorker(me, jobId).catch(() => {});
    return res.status(500).json({ error: 'Could not accept the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/reject
// A worker declines an offer. When everyone in the current round has
// declined, the next round starts right away instead of after the timeout.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/reject', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const now = new Date();

  try {
    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'SEARCHING',
        'dispatch.offers': { $elemMatch: { worker: req.user._id, response: null } },
      },
      {
        $set: {
          'dispatch.offers.$.response': 'rejected',
          'dispatch.offers.$.respondedAt': now,
        },
      },
      { new: true }
    );
    if (!job) return res.status(409).json({ error: 'This offer is no longer open.' });

    const round = job.dispatch.round;
    const roundOffers = job.dispatch.offers.filter((o) => o.round === round);
    if (roundOffers.every((o) => o.response === 'rejected')) {
      advanceNow(job._id, round).catch((err) =>
        console.error(`Could not advance dispatch for job ${job._id}:`, err.message)
      );
    }

    return res.status(204).end();
  } catch (err) {
    console.error('Job reject error:', err.message);
    return res.status(500).json({ error: 'Could not decline the offer.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/start
// The assigned worker has arrived and starts the job with the client's
// 4-digit start code. ASSIGNED → IN_PROGRESS.
// Body: { code }
// 400 → wrong code (attempts left in the message); 429 → too many wrong codes
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/start', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const me = req.user._id;
  const code = String(req.body?.code ?? '').trim();
  const mine = { _id: req.params.id, assignedWorker: me, status: 'ASSIGNED' };

  try {
    const job = await Job.findOneAndUpdate(
      { ...mine, startCode: code, startCodeAttempts: { $lt: MAX_START_CODE_ATTEMPTS } },
      { status: 'IN_PROGRESS', startedAt: new Date(), startCode: null },
      { new: true }
    );
    if (job) return res.status(200).json(toJob(job, me));

    // Not started — count a wrong guess, if this is the worker's job at all.
    const counted = await Job.findOneAndUpdate(
      { ...mine, startCodeAttempts: { $lt: MAX_START_CODE_ATTEMPTS } },
      { $inc: { startCodeAttempts: 1 } },
      { new: true }
    );
    if (!counted) {
      return (await Job.exists(mine))
        ? res.status(429).json({
            error: 'Too many wrong codes. Withdraw from this job so another worker can be found.',
          })
        : res.status(409).json({ error: 'This job can’t be started.' });
    }

    const left = MAX_START_CODE_ATTEMPTS - counted.startCodeAttempts;
    const message = left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong code.';
    return res.status(400).json({ error: message, fields: { code: message } });
  } catch (err) {
    console.error('Job start error:', err.message);
    return res.status(500).json({ error: 'Could not start the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/complete
// The assigned worker has finished. IN_PROGRESS → COMPLETED; the worker is
// free for new offers, and the job counts toward their stats and their
// history with this client.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/complete', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const me = req.user._id;

  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, assignedWorker: me, status: 'IN_PROGRESS' },
      { status: 'COMPLETED', completedAt: new Date() },
      { new: true }
    );
    if (!job) return res.status(409).json({ error: 'Only a job in progress can be completed.' });

    await releaseWorker(me, job._id);
    recordCompletion(job).catch((err) => console.error('Stats update failed:', err.message));
    // TODO(notify): ask the client for feedback.

    return res.status(200).json(toJob(job, me));
  } catch (err) {
    console.error('Job complete error:', err.message);
    return res.status(500).json({ error: 'Could not complete the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/withdraw
// The assigned worker backs out before starting. The job goes back to
// SEARCHING and dispatch resumes with a fresh set of rounds (this worker is
// never offered it again); the withdrawal counts against their reliability.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/withdraw', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const me = req.user._id;
  const mine = { _id: req.params.id, assignedWorker: me, status: 'ASSIGNED' };
  const notAllowed = () =>
    res.status(409).json({ error: 'You can only withdraw from a job you haven’t started.' });

  try {
    const current = await Job.findOne(mine).select('dispatch.round');
    if (!current) return notAllowed();

    const round = current.dispatch.round;
    const job = await Job.findOneAndUpdate(
      {
        ...mine,
        'dispatch.round': round,
        'dispatch.offers': { $elemMatch: { worker: me, response: 'accepted' } },
      },
      {
        $set: {
          status: 'SEARCHING',
          assignedWorker: null,
          assignedAt: null,
          startCode: null,
          startCodeAttempts: 0,
          'dispatch.firstRound': round + 1,
          'dispatch.offers.$.response': 'withdrawn',
          'dispatch.offers.$.respondedAt': new Date(),
        },
      },
      { new: true }
    );
    if (!job) return notAllowed();

    await releaseWorker(me, job._id);
    recordWithdrawal(me).catch((err) => console.error('Stats update failed:', err.message));
    // If this fails the dispatcher's sweep picks the job up within a minute.
    advanceNow(job._id, round).catch((err) =>
      console.error(`Could not resume dispatch for job ${job._id}:`, err.message)
    );
    // TODO(notify): tell the client their worker cancelled and we're finding another.

    return res.status(204).end();
  } catch (err) {
    console.error('Job withdraw error:', err.message);
    return res.status(500).json({ error: 'Could not withdraw from the job.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/feedback
// The client rates the worker who completed their job — once per job. Saved
// right away; the knowledge graph is updated in the background.
// Body: { rating: 1-5, praised?: [traitId], criticized?: [traitId],
//         rehire?: boolean, block?: boolean, comment? }
// 400 → { error, fields }; 409 → not completed yet, or already rated
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/feedback', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    const job = await Job.findOne({ _id: req.params.id, client: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'COMPLETED' || !job.assignedWorker) {
      return res.status(409).json({ error: 'You can rate the worker once the job is completed.' });
    }

    const { fields, errors } = validateFeedback(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    }

    let feedback;
    try {
      feedback = await Feedback.create({
        ...fields,
        job: job._id,
        client: job.client,
        worker: job.assignedWorker,
        category: job.category,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'You’ve already rated this job.' });
      }
      throw err;
    }

    job.feedbackAt = feedback.createdAt;
    await job.save();

    // If Redis is unreachable, the dispatcher's sweep picks it up later.
    enqueueFeedback(feedback._id).catch((err) =>
      console.error(`Graph update queue failed for feedback ${feedback._id}:`, err.message)
    );

    return res.status(201).json(toJob(job, req.user._id));
  } catch (err) {
    console.error('Job feedback error:', err.message);
    return res.status(500).json({ error: 'Could not save your feedback.' });
  }
});

module.exports = router;
