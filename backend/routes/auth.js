const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { initiateAadhaarOTP, verifyAadhaarOTP } = require('../services/meonApi');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

// ── Helper: sign a JWT for the app ──────────────────────────────────────────
function signAppToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/auth/google
// Called by the app after Google Sign-In succeeds on the device.
// Verifies the Google ID token, finds or creates a user, and returns a JWT.
// Response also tells the app whether Aadhaar verification is still needed.
// ────────────────────────────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { sub: googleId, email, picture, name } = payload;

    // Find or create user
    let user = await User.findOne({ googleId });
    const isNewUser = !user;

    if (isNewUser) {
      user = await User.create({
        googleId,
        googleEmail: email,
        googleAvatar: picture || null,
        // name comes from Aadhaar, not Google — leave null until verified
      });
    } else {
      // Update last login
      user.lastLoginAt = new Date();
      await user.save();
    }

    const token = signAppToken(user._id);

    return res.status(200).json({
      token,
      isNewUser,
      needsAadhaarVerification: !user.isAadhaarVerified,
      user: {
        id: user._id,
        googleEmail: user.googleEmail,
        googleAvatar: user.googleAvatar,
        name: user.name,
        dob: user.dob,
        isAadhaarVerified: user.isAadhaarVerified,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/auth/aadhaar/initiate
// Sends OTP to Aadhaar-linked mobile via Meon API.
// Requires: valid app JWT (user must be logged in via Google first)
// Body: { aadhaarNumber: "XXXXXXXXXXXX" }
// ────────────────────────────────────────────────────────────────────────────
router.post('/aadhaar/initiate', verifyToken, async (req, res) => {
  const { aadhaarNumber } = req.body;

  if (!aadhaarNumber || aadhaarNumber.replace(/\s/g, '').length !== 12) {
    return res.status(400).json({ error: 'Valid 12-digit Aadhaar number is required' });
  }

  try {
    const result = await initiateAadhaarOTP(aadhaarNumber.replace(/\s/g, ''));
    return res.status(200).json(result);
  } catch (err) {
    console.error('Aadhaar OTP initiate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/auth/aadhaar/verify
// Verifies OTP, retrieves Aadhaar demographics, updates MongoDB user doc.
// Requires: valid app JWT
// Body: { transactionId, otp, aadhaarLastFour }
// ────────────────────────────────────────────────────────────────────────────
router.post('/aadhaar/verify', verifyToken, async (req, res) => {
  const { transactionId, otp, aadhaarLastFour } = req.body;

  if (!transactionId || !otp) {
    return res.status(400).json({ error: 'transactionId and otp are required' });
  }

  try {
    const kyc = await verifyAadhaarOTP(transactionId, otp);

    // Update user with Aadhaar-sourced data
    const user = req.user;
    user.name = kyc.name;
    user.dob = kyc.dob;
    user.gender = kyc.gender;
    user.address = kyc.address;
    // Store only last 4 digits for privacy (UIDAI compliance)
    user.aadhaarNumber = aadhaarLastFour || (kyc.maskedAadhaar ? kyc.maskedAadhaar.slice(-4) : null);
    user.isAadhaarVerified = true;
    user.aadhaarVerifiedAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        dob: user.dob,
        gender: user.gender,
        googleEmail: user.googleEmail,
        googleAvatar: user.googleAvatar,
        isAadhaarVerified: user.isAadhaarVerified,
      },
    });
  } catch (err) {
    console.error('Aadhaar OTP verify error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the current authenticated user's profile
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  const u = req.user;
  return res.status(200).json({
    id: u._id,
    name: u.name,
    dob: u.dob,
    gender: u.gender,
    googleEmail: u.googleEmail,
    googleAvatar: u.googleAvatar,
    address: u.address,
    aadhaarNumber: u.aadhaarNumber,
    isAadhaarVerified: u.isAadhaarVerified,
    createdAt: u.createdAt,
  });
});

module.exports = router;
