const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { signJobPhotoUpload } = require('../services/cloudinary');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// POST /api/uploads/job-photo/sign
// Signs a direct-to-Cloudinary upload for one job photo. The app uploads the
// image itself and sends the returned secure_url when posting the job.
// Requires: valid app JWT
// Response: { uploadUrl, apiKey, timestamp, folder, signature }
// ────────────────────────────────────────────────────────────────────────────
router.post('/job-photo/sign', verifyToken, (req, res) => {
  try {
    return res.status(200).json(signJobPhotoUpload(req.user._id));
  } catch (err) {
    console.error('Upload sign error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
