const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { initiateDigilocker, verifyDigilocker } = require('../services/meonApi');
const verifyToken = require('../middleware/verifyToken');
const { buildProfile } = require('../services/membership');
const { IDENTITY_FIELDS, toProfile, validateProfileUpdate } = require('../services/profile');

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
      user: toProfile(user),
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/auth/aadhaar/initiate
// Generates a Digilocker URL for the user to authorize Aadhaar access.
// Requires: valid app JWT
// Body: none
// ────────────────────────────────────────────────────────────────────────────
router.post('/aadhaar/initiate', verifyToken, async (req, res) => {
  try {
    const result = await initiateDigilocker();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Digilocker initiate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/auth/aadhaar/verify
// Fetches data from Digilocker after the user completes the browser flow.
// Requires: valid app JWT
// Body: { clientToken, state }
// ────────────────────────────────────────────────────────────────────────────
router.post('/aadhaar/verify', verifyToken, async (req, res) => {
  const { clientToken, state } = req.body;

  if (!clientToken || !state) {
    return res.status(400).json({ error: 'clientToken and state are required' });
  }

  try {
    const kyc = await verifyDigilocker(clientToken, state);

    // Update user with Aadhaar-sourced data
    const user = req.user;
    user.name = kyc.name;
    user.dob = kyc.dob;
    user.gender = kyc.gender;
    user.address = kyc.address;
    user.aadhaarNumber = kyc.maskedAadhaar ? kyc.maskedAadhaar.slice(-4) : null;
    user.isAadhaarVerified = true;
    user.aadhaarVerifiedAt = new Date();
    user.detailsSource = 'aadhaar';
    await user.save();

    return res.status(200).json({
      success: true,
      user: await buildProfile(user),
    });
  } catch (err) {
    console.error('Digilocker verify error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the current authenticated user's profile
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  return res.status(200).json(await buildProfile(req.user));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/me
// Updates the user's own profile. Contact fields are always editable;
// name/dob/gender/address only until Aadhaar verification locks them.
// Body: any of { name, dob, gender, address, phone, city, pincode,
//               preferredLanguage, location: { lat, lng } | null }
//       — empty string (or null location) clears a field.
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.patch('/me', verifyToken, async (req, res) => {
  const user = req.user;
  const { updates, errors } = validateProfileUpdate(user, req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  try {
    Object.assign(user, updates);
    if (updates.location === null) user.location = undefined;
    if (IDENTITY_FIELDS.some((f) => f in updates)) {
      user.detailsSource = 'manual';
    }
    await user.save();
    return res.status(200).json(await buildProfile(user));
  } catch (err) {
    console.error('Profile update error:', err.message);
    return res.status(500).json({ error: 'Could not save your profile.' });
  }
});

module.exports = router;
