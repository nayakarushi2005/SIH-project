const express = require('express');
const router = express.Router();
const { googleAuth } = require('../controllers/authController');
const { ensureAuth } = require('../middleware/authMiddleware');

// Route for Web Google OAuth (Federation & GovOfficial)
router.post('/google', googleAuth);

// Example of a protected route using our new middleware
router.get('/me', ensureAuth, (req, res) => {
  res.status(200).json({ 
    message: 'You have access to the web dashboard!', 
    user: req.user 
  });
});

module.exports = router;
