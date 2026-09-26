const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { initiateDigilocker, verifyDigilocker } = require('../services/meonApi');
const verifyToken = require('../middleware/verifyToken');
const { IDENTITY_FIELDS, toProfile, validateProfileUpdate } = require('../services/profile');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

function signAppToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { sub: googleId, email, picture, name } = payload;

    let user = await User.findOne({ googleId });
    const isNewUser = !user;

    if (isNewUser) {
      user = await User.create({
        googleId,
        googleEmail: email,
        googleAvatar: picture || null,
      });
    } else {
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

router.post('/aadhaar/initiate', verifyToken, async (req, res) => {
  try {
    const result = await initiateDigilocker();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Digilocker initiate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/aadhaar/verify', verifyToken, async (req, res) => {
  const { clientToken, state } = req.body;

  if (!clientToken || !state) {
    return res.status(400).json({ error: 'clientToken and state are required' });
  }

  try {
    const kyc = await verifyDigilocker(clientToken, state);

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
      user: toProfile(user),
    });
  } catch (err) {
    console.error('Digilocker verify error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  return res.status(200).json(toProfile(req.user));
});

router.patch('/me', verifyToken, async (req, res) => {
  const user = req.user;
  const { updates, errors } = validateProfileUpdate(user, req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  try {
    Object.assign(user, updates);
    if (IDENTITY_FIELDS.some((f) => f in updates)) {
      user.detailsSource = 'manual';
    }
    await user.save();
    return res.status(200).json(toProfile(user));
  } catch (err) {
    console.error('Profile update error:', err.message);
    return res.status(500).json({ error: 'Could not save your profile.' });
  }
});

module.exports = router;
