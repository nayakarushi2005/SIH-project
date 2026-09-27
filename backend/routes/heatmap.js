const express = require('express');
const WorkerProfile = require('../models/WorkerProfile');
const { ensureAuth } = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const verifyToken = require('../middleware/verifyToken');
const { sendError } = require('../services/errors');
const {
  availabilityHeatmap,
  demandHeatmap,
  govHeatmap,
  parseBounds,
  pickCategory,
} = require('../services/heatmap');
const { toGeoPoint } = require('../services/job');

const router = express.Router();

/** The caller's position from ?lat&lng as [lng, lat], or sends a 400 and returns null. */
function readCenter(req, res) {
  try {
    return toGeoPoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }).coordinates;
  } catch (thrown) {
    sendError(res, 400, thrown.code, thrown.message);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/heatmap/demand?lat&lng&category?&window=today|7d|30d
// Worker: where jobs for their skills (or `category`) were posted nearby.
// ────────────────────────────────────────────────────────────────────────────
router.get('/demand', verifyToken, async (req, res) => {
  if (!req.user.isWorker) {
    return sendError(res, 403, 'heatmap_workers_only', 'Register as a worker to see where the work is.');
  }
  const center = readCenter(req, res);
  if (!center) return undefined;
  try {
    let categories = [pickCategory(req.query.category)].filter(Boolean);
    if (categories.length === 0) {
      const profile = await WorkerProfile.findOne({ user: req.user._id }).select('skills').lean();
      categories = profile?.skills?.length ? profile.skills : req.user.worker?.categories ?? [];
    }
    return res.status(200).json(await demandHeatmap({ center, categories, window: req.query.window }));
  } catch (err) {
    console.error('Demand heatmap error:', err.message);
    return sendError(res, 500, 'heatmap_load_failed', 'Could not load the map.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/heatmap/availability?lat&lng&category?
// Anyone signed in: workers online nearby for a service, and the usual wait.
// ────────────────────────────────────────────────────────────────────────────
router.get('/availability', verifyToken, async (req, res) => {
  const center = readCenter(req, res);
  if (!center) return undefined;
  try {
    return res.status(200).json(
      await availabilityHeatmap({ center, category: pickCategory(req.query.category), viewerId: req.user._id })
    );
  } catch (err) {
    console.error('Availability heatmap error:', err.message);
    return sendError(res, 500, 'heatmap_load_failed', 'Could not load the map.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/heatmap/gov?sw=lat,lng&ne=lat,lng&category?&window=7d|30d|90d
// Government officials (web portal): demand vs supply inside the map view.
// ────────────────────────────────────────────────────────────────────────────
router.get('/gov', ensureAuth, requireRole('GovOfficial'), async (req, res) => {
  let bounds;
  try {
    bounds = parseBounds(req.query.sw, req.query.ne);
  } catch (thrown) {
    return sendError(res, 400, thrown.code, thrown.message);
  }
  try {
    return res.status(200).json(
      await govHeatmap({ bounds, category: pickCategory(req.query.category), window: req.query.window })
    );
  } catch (err) {
    console.error('Gov heatmap error:', err.message);
    return sendError(res, 500, 'heatmap_load_failed', 'Could not load the map.');
  }
});

module.exports = router;
