const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { toProfile } = require('../services/profile');
const { validateRegistration } = require('../services/worker');

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
  const { updates, errors } = await validateRegistration(user, req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }
  try {
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
    return res.status(200).json(toProfile(user));
  } catch (err) {
    console.error('Worker register error:', err.message);
    return res.status(500).json({ error: 'Could not register you as a worker.' });
  }
});

// POST /api/worker/deregister — stop being a worker; keeps data for next time.
router.post('/deregister', async (req, res) => {
  try {
    req.user.isWorker = false;
    req.user.worker.deregisteredAt = new Date();
    await req.user.save();
    return res.status(200).json(toProfile(req.user));
  } catch (err) {
    console.error('Worker deregister error:', err.message);
    return res.status(500).json({ error: 'Could not update your worker status.' });
  }
});

// POST /api/worker/dismiss-prompt — "I'm not a worker": stop asking.
router.post('/dismiss-prompt', async (req, res) => {
  try {
    req.user.workerPromptDismissed = true;
    await req.user.save();
    return res.status(200).json(toProfile(req.user));
  } catch (err) {
    console.error('Dismiss worker prompt error:', err.message);
    return res.status(500).json({ error: 'Could not save your choice.' });
  }
});

module.exports = router;
