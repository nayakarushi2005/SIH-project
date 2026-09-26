const { verifyAccessToken, generateAccessToken } = require('../utils/tokenUtils');
const RefreshToken = require('../models/RefreshToken');

/**
 * Middleware to protect routes.
 * It checks the Access Token first. If expired/missing, it falls back to checking the Refresh Token in cookies.
 */
const ensureAuth = async (req, res, next) => {
  try {
    // 1. Extract the access token from the Authorization header
    const authHeader = req.headers.authorization;
    
    // If there is no access token at all, we immediately try the refresh flow
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return handleRefresh(req, res);
    }

    const accessToken = authHeader.split(' ')[1];

    // 2. Try to verify the access token
    try {
      const decoded = verifyAccessToken(accessToken);
      // Valid access token: attach user info to request and proceed to the controller
      req.user = decoded; // Contains { userId, userModel }
      return next();
    } catch (error) {
      // Access token verification failed (most likely expired). Fall back to refresh logic.
      return handleRefresh(req, res);
    }
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({ message: 'Internal Server Error during authentication' });
  }
};

/**
 * Helper function to handle the refresh token logic if the access token fails.
 */
const handleRefresh = async (req, res) => {
  try {
    // 1. Check if the refresh token exists in cookies
    // (Make sure you have cookie-parser middleware set up in server.js)
    const refreshTokenString = req.cookies?.refreshToken;
    
    if (!refreshTokenString) {
      // No refresh token means they are completely logged out
      return res.status(403).json({ message: 'Session expired. Please log in again.', code: 'session_expired' });
    }

    // 2. Find the refresh token in the database
    const tokenDoc = await RefreshToken.findOne({ token: refreshTokenString });
    
    if (!tokenDoc) {
      // Token is not in DB (invalidated or fake), clear the cookie and force logout
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: 'Invalid session. Please log in again.', code: 'session_expired' });
    }

    // 3. Double-check expiration (MongoDB TTL usually handles this, but it's good practice)
    if (tokenDoc.expiresAt < new Date()) {
      await RefreshToken.findByIdAndDelete(tokenDoc._id);
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: 'Session expired. Please log in again.', code: 'session_expired' });
    }

    // 4. Token is valid! Generate a NEW access token using the user info stored in the token document
    const newAccessToken = generateAccessToken(tokenDoc.userId, tokenDoc.userModel);

    // 5. Return a 401 response with the new token. 
    // The frontend Axios interceptor should catch this 401, grab the new token, and retry the request.
    return res.status(401).json({
      message: 'Access token refreshed',
      newAccessToken: newAccessToken,
    });
    
  } catch (error) {
    console.error('Refresh Logic Error:', error);
    return res.status(500).json({ message: 'Internal server error during token refresh' });
  }
};

module.exports = { ensureAuth };
