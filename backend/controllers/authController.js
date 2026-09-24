const { OAuth2Client } = require('google-auth-library');
const GovOfficial = require('../models/GovOfficial');
const RefreshToken = require('../models/RefreshToken');
const { generateAccessToken, generateRefreshTokenString } = require('../utils/tokenUtils');

// Initialize Google Client
// Ensure you have GOOGLE_CLIENT_ID in your .env
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleAuth = async (req, res) => {
  try {
    const { googleToken, userType } = req.body;

    if (!googleToken) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    if (!['GovOfficial', 'Federation'].includes(userType)) {
      return res.status(400).json({ message: 'Invalid userType provided' });
    }

    // 1. Verify the Google Token
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: googleToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      console.error('Google token verification failed:', error);
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name } = payload;
    let user;

    // 2. Find or Create User based on userType
    if (userType === 'GovOfficial') {
      user = await GovOfficial.findOne({ googleId });
      
      if (!user) {
        // First time login - Register them
        user = await GovOfficial.create({
          googleId,
          email,
          name,
        });
      }
    } else if (userType === 'Federation') {
      // NOTE: Federation model is WIP by teammate. 
      // You can replace this with the actual Federation logic later.
      return res.status(501).json({ message: 'Federation login not yet implemented' });
    }

    // 3. Generate our application tokens
    const accessToken = generateAccessToken(user._id, userType);
    const refreshTokenString = generateRefreshTokenString();

    // 4. Save the refresh token to the database
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      token: refreshTokenString,
      userId: user._id,
      userModel: userType,
      expiresAt: thirtyDaysFromNow,
    });

    // 5. Set the HTTP-only cookie
    res.cookie('refreshToken', refreshTokenString, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // True if running in HTTPS
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // 6. Send success response to the frontend
    return res.status(200).json({
      message: 'Authentication successful',
      accessToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      }
    });

  } catch (error) {
    console.error('Google Auth Controller Error:', error);
    return res.status(500).json({ message: 'Internal server error during authentication' });
  }
};

module.exports = {
  googleAuth,
};
