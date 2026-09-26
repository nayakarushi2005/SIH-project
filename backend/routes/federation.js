const express = require('express');
const router = express.Router();
const {
  registerFederation,
  checkFederationByEmail,
  getAllFederations,
  getFederationById,
  verifyFederation,
  listMyRequests,
  decideMyRequest,
  removeMyMember,
} = require('../controllers/federationController');
const { ensureAuth } = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Apply ensureAuth to all federation routes
router.use(ensureAuth);

// A federation fills in / updates its own details
router.post('/register', requireRole('Federation'), registerFederation);

// Check if federation exists by email
router.get('/check-email/:email', checkFederationByEmail);

// Government officials review every federation
router.get('/all', requireRole('GovOfficial'), getAllFederations);

// Federation portal: worker join requests (must come before '/:id')
router.get('/me/requests', requireRole('Federation'), listMyRequests);
router.patch('/me/requests/:id', requireRole('Federation'), decideMyRequest);
router.delete('/me/members/:id', requireRole('Federation'), removeMyMember);

// Route to get a specific federation by ID
router.get('/:id', getFederationById);

// Only government officials can verify or reject a federation
router.patch('/:id/verify', requireRole('GovOfficial'), verifyFederation);

module.exports = router;
