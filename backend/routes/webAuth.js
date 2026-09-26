const express = require('express');
const router = express.Router();
const { googleAuth, refreshSession, logout } = require('../controllers/authController');
const { ensureAuth } = require('../middleware/authMiddleware');

// Route for Web Google OAuth (Federation & GovOfficial)
router.post('/google', googleAuth);

// Route to restore session via refresh token cookie
router.get('/refresh', refreshSession);

// Route to logout and clear session cookie
router.post('/logout', logout);

// Example of a protected route using our new middleware
router.get('/me', ensureAuth, (req, res) => {
  res.status(200).json({ 
    message: 'You have access to the web dashboard!', 
    user: req.user 
  });
});

module.exports = router;
