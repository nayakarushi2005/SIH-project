const express = require('express');
const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const verifyToken = require('../middleware/verifyToken');
const { workerInsights } = require('../services/graph');
const { toGeoPoint, toOffer } = require('../services/job');
const { toWorkerProfile, validateWorkerProfile } = require('../services/worker');

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
  } catch (message) {
    res.status(400).json({ error: message, fields: { location: message } });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/workers/me
// The current user's worker profile. 404 → not registered as a worker yet.
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const profile = await WorkerProfile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Not registered as a worker' });
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker profile fetch error:', err.message);
    return res.status(500).json({ error: 'Could not load your worker profile.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/workers/me
// Registers the current user as a worker, or updates their worker profile.
// Requires: Aadhaar-verified user
// Body: { skills: [serviceId], bio?, experienceYears?, serviceRadiusKm? }
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.put('/me', verifyToken, requireAadhaar, async (req, res) => {
  const { fields, errors } = validateWorkerProfile(req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  try {
    const profile = await WorkerProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: fields },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker profile save error:', err.message);
    return res.status(500).json({ error: 'Could not save your worker profile.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/workers/me/online
// Starts taking jobs from the given position.
// Requires: Aadhaar-verified user with a worker profile
// Body: { location: { lat, lng } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/me/online', verifyToken, requireAadhaar, async (req, res) => {
  const location = readLocation(req.body, res);
  if (!location) return;

  try {
    const profile = await WorkerProfile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Not registered as a worker' });
    if (!profile.isActive) {
      return res.status(403).json({ error: 'Your worker account is suspended.' });
    }

    profile.isOnline = true;
    profile.location = location;
    profile.lastSeenAt = new Date();
    await profile.save();
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker online error:', err.message);
    return res.status(500).json({ error: 'Could not go online.' });
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
    if (!profile) return res.status(409).json({ error: 'You are offline.' });
    return res.status(204).end();
  } catch (err) {
    console.error('Worker location error:', err.message);
    return res.status(500).json({ error: 'Could not update your location.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/workers/me/offline
// Stops taking new jobs. A job already in progress is unaffected.
// ────────────────────────────────────────────────────────────────────────────
router.post('/me/offline', verifyToken, async (req, res) => {
  try {
    const profile = await WorkerProfile.findOneAndUpdate(
      { user: req.user._id },
      { isOnline: false },
      { new: true }
    );
    if (!profile) return res.status(404).json({ error: 'Not registered as a worker' });
    return res.status(200).json(toWorkerProfile(profile));
  } catch (err) {
    console.error('Worker offline error:', err.message);
    return res.status(500).json({ error: 'Could not go offline.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/workers/me/offers
// Job offers waiting for this worker's answer, newest first. The app polls
// this every few seconds while online (until push notifications land).
// Answer with POST /api/jobs/:id/accept or /reject.
// ────────────────────────────────────────────────────────────────────────────
router.get('/me/offers', verifyToken, async (req, res) => {
  const me = req.user._id;

  try {
    const profile = await WorkerProfile.findOne({ user: me }).select('currentJob');
    if (!profile) return res.status(404).json({ error: 'Not registered as a worker' });
    if (profile.currentJob) return res.status(200).json([]); // busy — can't accept anyway

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
    return res.status(500).json({ error: 'Could not load your offers.' });
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
      return res.status(404).json({ error: 'Not registered as a worker' });
    }
    return res.status(200).json(await workerInsights(req.user._id));
  } catch (err) {
    console.error('Worker insights error:', err.message);
    return res.status(500).json({ error: 'Could not load your insights.' });
  }
});

module.exports = router;
