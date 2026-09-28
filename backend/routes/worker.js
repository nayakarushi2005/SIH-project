const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const {
  buildProfile,
  leaveMembership,
  requestMembership,
  sendMembershipError,
  currentMembership,
} = require('../services/membership');
const { sendError, splitFieldErrors } = require('../services/errors');
const { validateRegistration } = require('../services/worker');
const { syncFromRegistration } = require('../services/workerProfile');
const InsuranceApplication = require('../models/InsuranceApplication');

const router = express.Router();
router.use(verifyToken);

// ────────────────────────────────────────────────────────────────────────────
// POST /api/worker/register
// Body: { name?, incomeBracket, categories: [slug], onboardedVia? }
// `name` is required until Aadhaar verification, ignored after it.
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const user = req.user;
  try {
    const { updates, errors } = await validateRegistration(user, req.body);
    if (Object.keys(errors).length > 0) {
      const { fields, fieldCodes, fieldParams } = splitFieldErrors(errors);
      return res.status(400).json({
        error: 'Please fix the highlighted fields.',
        code: 'validation',
        fields,
        fieldCodes,
        fieldParams,
      });
    }
    if (updates.name) {
      user.name = updates.name;
      user.detailsSource = 'manual';
    }
    user.isWorker = true;
    user.worker.incomeBracket = updates.incomeBracket;
    user.worker.categories = updates.categories;
    user.worker.onboardedVia = updates.onboardedVia;
    user.worker.registeredAt = new Date();
    user.worker.deregisteredAt = null;
    await user.save();
    await syncFromRegistration(user); // worker mode: skills = these categories
    return res.status(200).json(await buildProfile(user));
  } catch (err) {
    console.error('Worker register error:', err.message);
    return sendError(res, 500, 'worker_register_failed', 'Could not register you as a worker.');
  }
});

// POST /api/worker/deregister — stop being a worker; keeps data for next
// time, and leaves any federation.
router.post('/deregister', async (req, res) => {
  try {
    await leaveMembership(req.user, { quiet: true });
    req.user.isWorker = false;
    // They chose to stop — don't ask "Looking for work?" again. They can
    // still register from Profile.
    req.user.workerPromptDismissed = true;
    req.user.worker.deregisteredAt = new Date();
    await req.user.save();
    await syncFromRegistration(req.user); // worker mode: offline, out of matching
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    console.error('Worker deregister error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not update your worker status.');
  }
});

// POST /api/worker/dismiss-prompt — "I'm not a worker": stop asking.
router.post('/dismiss-prompt', async (req, res) => {
  try {
    req.user.workerPromptDismissed = true;
    await req.user.save();
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    console.error('Dismiss worker prompt error:', err.message);
    return sendError(res, 500, 'worker_update_failed', 'Could not save your choice.');
  }
});

// POST /api/worker/federation { federationId } — ask to join a nearby federation.
router.post('/federation', async (req, res) => {
  try {
    await requestMembership(req.user, req.body?.federationId);
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});

// DELETE /api/worker/federation — cancel a pending request or leave.
router.delete('/federation', async (req, res) => {
  try {
    await leaveMembership(req.user);
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});

// GET /api/worker/insurance — see available insurance and your status
router.get('/insurance', async (req, res) => {
  try {
    const mem = await currentMembership(req.user._id);
    if (!mem || mem.status !== 'verified') {
      return res.status(403).json({ message: 'You must be a verified member of a federation to access insurance.' });
    }

    const packages = [
      { id: 1, name: 'Gig Worker Health Secure', provider: 'LIC', coverage: '₹5,00,000', premium: '₹400/year', interest: 'Min 2%', paperwork: 'Minimal/Aadhaar Only' },
      { id: 2, name: 'Accidental Cover Pro', provider: 'HDFC Ergo', coverage: '₹10,00,000', premium: '₹250/year', interest: '0%', paperwork: 'Paperless' },
      { id: 3, name: 'Life & Family Safeguard', provider: 'SBI Life', coverage: '₹2,00,000', premium: '₹150/year', interest: '1%', paperwork: 'No Medicals' }
    ];

    const apps = await InsuranceApplication.find({ workerId: req.user._id, federationId: mem.id }).lean();
    return res.status(200).json({ packages, applications: apps });
  } catch (err) {
    return sendError(res, 500, 'fetch_failed', 'Could not load insurance data.');
  }
});

// POST /api/worker/insurance/:packageId/apply
router.post('/insurance/:packageId/apply', async (req, res) => {
  try {
    const mem = await currentMembership(req.user._id);
    if (!mem || mem.status !== 'verified') {
      return res.status(403).json({ message: 'You must be a verified member of a federation to apply.' });
    }
    const packageId = parseInt(req.params.packageId);
    
    // Find name
    const packages = [
      { id: 1, name: 'Gig Worker Health Secure' },
      { id: 2, name: 'Accidental Cover Pro' },
      { id: 3, name: 'Life & Family Safeguard' }
    ];
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return res.status(404).json({ message: 'Insurance package not found.' });

    // Check if already applied
    const existing = await InsuranceApplication.findOne({ workerId: req.user._id, packageId });
    if (existing) {
      return res.status(400).json({ message: 'You have already applied for this insurance package.' });
    }

    const application = new InsuranceApplication({
      workerId: req.user._id,
      federationId: mem.id,
      packageId,
      packageName: pkg.name,
      status: 'approved'
    });
    await application.save();
    return res.status(200).json({ message: 'Redirecting to provider and activating policy', application });
  } catch (err) {
    return sendError(res, 500, 'apply_failed', 'Could not submit insurance application.');
  }
});

module.exports = router;
