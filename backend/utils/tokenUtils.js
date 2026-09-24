const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generates a short-lived JSON Web Token for API access.
 * @param {String} userId - The MongoDB ObjectId of the user.
 * @param {String} userModel - 'Federation' or 'GovOfficial'
 * @returns {String} - Signed JWT
 */
const generateAccessToken = (userId, userModel) => {
  // Ensure you add JWT_ACCESS_SECRET to your .env file
  return jwt.sign(
    { userId, userModel },
    process.env.JWT_ACCESS_SECRET || 'fallback_secret_for_dev',
    { expiresIn: '15m' }
  );
};

/**
 * Generates a random opaque string to act as a refresh token.
 * We don't necessarily need a JWT here because we are verifying it against the database.
 * @returns {String} - Random hex string
 */
const generateRefreshTokenString = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Verifies an access token.
 * @param {String} token 
 * @returns {Object} - Decoded payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'fallback_secret_for_dev');
};

module.exports = {
  generateAccessToken,
  generateRefreshTokenString,
  verifyAccessToken,
};
