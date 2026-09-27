const express = require('express');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const verifyToken = require('../middleware/verifyToken');
const { declineOffer } = require('../services/dispatch');
const { sendError, splitFieldErrors } = require('../services/errors');
const { workerInsights } = require('../services/graph');
const { toGeoPoint, toOffer } = require('../services/job');
const {
  ensureWorkerProfile,
  toWorkerProfile,
  validateWorkerProfile,
} = require('../services/workerProfile');

const router = express.Router();

// The app promises clients that every worker is identity-verified.
function requireAadhaar(req, res, next) {
  if (!req.user.isAadhaarVerified) {
    return res.status(403).json({
      error: 'Verify your Aadhaar with DigiLocker before taking jobs.',
      code: 'AADHAAR_REQUIRED',
    });
  }
  next();
}

function readLocation(body, res) {
  try {
    return toGeoPoint(body?.location);
  } catch (thrown) {
    const { fields, fieldCodes, fieldParams } = splitFieldErrors({ location: thrown });
    res.status(400).json({
      error: fields.location,
      code: 'validation',
      fields,
      fieldCodes,
      fieldParams,
    });
    return null;
  }
}

const notRegistered = (res) =>
  res.status(404).json({ error: 'Register as a worker first.', code: 'NOT_REGISTERED' });

const notRegisteredWorker = (res) =>
  sendError(res, 404, 'worker_not_registered', 'Not registered as a worker');

// ────────────────────────────────────────────────────────────────────────────
// GET /api/workers/me
// The current user's worker-mode profile. Workers who registered (routes/
// worker.js) before worker mode existed get one created on first visit.
// 404 (code NOT_REGISTERED) → not registered as a worker.
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const profile = await ensureWorkerProfile(req.user);
    if (!profile) return notRegistered(res);
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker profile fetch error:', err.message);
    return sendError(res, 500, 'worker_load_failed', 'Could not load your worker profile.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/workers/me
// Updates a registered worker's work settings. Registering itself happens
// through POST /api/worker/register (form or voice).
// Body: { skills: [categorySlug], bio?, experienceYears?, serviceRadiusKm? }
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.put('/me', verifyToken, async (req, res) => {
  if (!req.user.isWorker) return notRegistered(res);

  const { fields, errors } = await validateWorkerProfile(req.body);
  if (Object.keys(errors).length > 0) {
    const { fields: errFields, fieldCodes, fieldParams } = splitFieldErrors(errors);
    return res.status(400).json({
      error: 'Please fix the highlighted fields.',
      code: 'validation',
      fields: errFields,
      fieldCodes,
      fieldParams,
    });
  }

  try {
    const profile = await WorkerProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: fields },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    // Keep the registration's categories and worker-mode skills one list.
    req.user.worker.categories = fields.skills;
    await req.user.save();
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker profile save error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not save your worker profile.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/workers/me/online
// Starts taking jobs from the given position.
// Requires: Aadhaar-verified, registered worker
// Body: { location: { lat, lng } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/me/online', verifyToken, requireAadhaar, async (req, res) => {
  const location = readLocation(req.body, res);
  if (!location) return;

  try {
    const profile = await ensureWorkerProfile(req.user);
    if (!profile || !req.user.isWorker) return notRegistered(res);
    if (!profile.isActive) {
      return sendError(res, 403, 'worker_inactive', 'Your worker account isn’t active.');
    }

    profile.isOnline = true;
    profile.location = location;
    profile.lastSeenAt = new Date();
    await profile.save();
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker online error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not go online.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/workers/me/location
// Heartbeat the app sends about once a minute while online. Keeps the worker
// visible to matching; a worker silent for 3 minutes drops out of it.
// Body: { location: { lat, lng } }
// 409 → the worker is offline; the app should stop sending heartbeats
// ────────────────────────────────────────────────────────────────────────────
router.post('/me/location', verifyToken, async (req, res) => {
  const location = readLocation(req.body, res);
  if (!location) return;

  try {
    const profile = await WorkerProfile.findOneAndUpdate(
      { user: req.user._id, isOnline: true, isActive: true },
      { location, lastSeenAt: new Date() },
      { new: true }
    );
    if (!profile) return sendError(res, 409, 'worker_offline', 'You are offline.');
    return res.status(204).end();
  } catch (err) {
    console.error('Worker location error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not update your location.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/workers/me/offline
// Stops taking new jobs. Offers still waiting for an answer are declined, so
// those jobs move on to other workers instead of waiting for this one — and
// don't reappear when the worker comes back online. A job the worker already
// accepted is unaffected.
// ────────────────────────────────────────────────────────────────────────────
router.post('/me/offline', verifyToken, async (req, res) => {
  const me = req.user._id;

  try {
    const profile = await WorkerProfile.findOneAndUpdate({ user: me }, { isOnline: false }, { new: true });
    if (!profile) return notRegisteredWorker(res);

    const now = new Date();
    const open = await Job.find({
      status: 'SEARCHING',
      'dispatch.offers': { $elemMatch: { worker: me, response: null, expiresAt: { $gt: now } } },
    }).select('_id');
    await Promise.all(open.map((job) => declineOffer(job._id, me, now)));

    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker offline error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not go offline.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/workers/me/offers
// Job offers waiting for this worker's answer, newest first. The app polls
// this every few seconds while online, on any screen (until push
// notifications land). Only jobs still SEARCHING are listed, so a job
// disappears for everyone the moment one worker accepts it.
// Answer with POST /api/jobs/:id/accept or /reject.
// ────────────────────────────────────────────────────────────────────────────
router.get('/me/offers', verifyToken, async (req, res) => {
  const me = req.user._id;

  try {
    const profile = await WorkerProfile.findOne({ user: me }).select('currentJob isOnline');
    if (!profile) return notRegisteredWorker(res);
    // Offline — not taking jobs; busy — can't accept one anyway.
    if (!profile.isOnline || profile.currentJob) return res.status(200).json([]);

    const jobs = await Job.find({
      status: 'SEARCHING',
      'dispatch.offers': {
        $elemMatch: { worker: me, response: null, expiresAt: { $gt: new Date() } },
      },
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json(jobs.map((job) => toOffer(job, me)));
  } catch (err) {
    console.error('Worker offers error:', err.message);
    return sendError(res, 500, 'worker_load_failed', 'Could not load your offers.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/workers/me/insights
// What clients' feedback says about this worker, from the knowledge graph:
// { rating: { average, count }, completedJobs, strengths: [{ trait, score, mentions }],
//   improve: [{ type: 'trait'|'skill', id, score, mentions }],
//   skills: [{ skill, level, jobs, avgRating }] }
// `improve` is what free course recommendations will be matched against.
// ────────────────────────────────────────────────────────────────────────────
router.get('/me/insights', verifyToken, async (req, res) => {
  try {
    if (!(await WorkerProfile.exists({ user: req.user._id }))) {
      return notRegisteredWorker(res);
    }
    return res.status(200).json(await workerInsights(req.user._id));
  } catch (err) {
    console.error('Worker insights error:', err.message);
    return sendError(res, 500, 'worker_load_failed', 'Could not load your insights.');
  }
});

module.exports = router;
