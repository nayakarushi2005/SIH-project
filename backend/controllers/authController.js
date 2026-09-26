const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const GovOfficial = require('../models/GovOfficial');
const RefreshToken = require('../models/RefreshToken');
const { generateAccessToken, generateRefreshTokenString } = require('../utils/tokenUtils');

// Initialize Google Client
// Ensure you have GOOGLE_WEB_CLIENT_ID in your .env
const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

const googleAuth = async (req, res) => {
  try {
    const { googleToken, userType } = req.body;

    if (!googleToken) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    if (!['GovOfficial', 'Federation'].includes(userType)) {
      return res.status(400).json({ message: 'Invalid userType provided' });
    }

    // 1. Verify the Google Token (which is an access_token from Implicit Flow)
    let payload;
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      payload = response.data;
    } catch (error) {
      console.error('Google access token verification failed:', error.response?.data || error.message);
      return res.status(401).json({ message: 'Invalid Google access token' });
    }

    const { sub: googleId, email, name } = payload;
    let user;
    let isNewUser = false;

    // 2. Find or Create User based on userType
    if (userType === 'GovOfficial') {
      user = await GovOfficial.findOne({ googleId });
      
      if (!user) {
        // First time login - Register them
        isNewUser = true;
        user = await GovOfficial.create({
          googleId,
          email,
          name,
        });
      }
    } else if (userType === 'Federation') {
      const Federation = require('../models/Federation');
      user = await Federation.findOne({ email });

      if (!user) {
        isNewUser = true;
        // Auto-generate unique fedId for the first time registration
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const fedId = `FED-${randomSuffix}`;

        user = await Federation.create({
          fedId,
          name,
          email,
        });
      }
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
    const statusCode = isNewUser ? 201 : 200;
    return res.status(statusCode).json({
      message: isNewUser ? 'Registration successful' : 'Authentication successful',
      isNewUser,
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

// ── Silent Refresh / Session Restoration ─────────────────────────────────────
const refreshSession = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    // Find the refresh token in the database
    const tokenRecord = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenRecord) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Check if it's expired
    if (new Date() > tokenRecord.expiresAt) {
      await RefreshToken.deleteOne({ _id: tokenRecord._id });
      return res.status(403).json({ message: 'Refresh token expired' });
    }

    // Retrieve the user from the correct collection
    let user;
    if (tokenRecord.userModel === 'GovOfficial') {
      user = await GovOfficial.findById(tokenRecord.userId);
    } else if (tokenRecord.userModel === 'Federation') {
      const Federation = require('../models/Federation');
      user = await Federation.findById(tokenRecord.userId);
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a fresh access token
    const accessToken = generateAccessToken(user._id, tokenRecord.userModel);

    return res.status(200).json({
      message: 'Session restored',
      accessToken,
      isNewUser: false, // Since they are refreshing, they aren't 'new' anymore
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      userType: tokenRecord.userModel,
    });
  } catch (error) {
    console.error('Refresh Session Error:', error);
    return res.status(500).json({ message: 'Internal server error during session refresh' });
  }
};

// ── Logout / Clear Session ───────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      // Remove it from the database to invalidate it completely
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    // Clear the cookie from the browser
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout Error:', error);
    return res.status(500).json({ message: 'Internal server error during logout' });
  }
};

module.exports = {
  googleAuth,
  refreshSession,
  logout,
};
