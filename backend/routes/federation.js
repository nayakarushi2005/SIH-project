const express = require('express');
const router = express.Router();
const {
  registerFederation,
  updateMyLocation,
  checkFederationByEmail,
  getAllFederations,
  getFederationById,
  verifyFederation,
  listMyRequests,
  decideMyRequest,
  removeMyMember,
  getInsurancePackages,
  addInsurancePackage,
  updateInsurancePackage,
  applyInsurance,
  getInsuranceApplications,
  verifyInsuranceApplication,
} = require('../controllers/federationController');
const { ensureAuth } = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Apply ensureAuth to all federation routes
router.use(ensureAuth);

// A federation fills in / updates its own details
router.post('/register', requireRole('Federation'), registerFederation);

// A federation moves its city / PIN without re-registering
router.patch('/me/location', requireRole('Federation'), updateMyLocation);

// Check if federation exists by email
router.get('/check-email/:email', requireRole('Federation'), checkFederationByEmail);

// Government officials review every federation
router.get('/all', requireRole('GovOfficial'), getAllFederations);

// Federation portal: worker join requests (must come before '/:id')
router.get('/me/requests', requireRole('Federation'), listMyRequests);
router.patch('/me/requests/:id', requireRole('Federation'), decideMyRequest);
router.delete('/me/members/:id', requireRole('Federation'), removeMyMember);

// Federation portal: insurance collaboration
router.get('/me/insurance', requireRole('Federation'), getInsurancePackages);
router.post('/me/insurance', requireRole('Federation'), addInsurancePackage);
router.patch('/me/insurance/:id', requireRole('Federation'), updateInsurancePackage);
router.post('/me/insurance/:packageId/apply', requireRole('Federation'), applyInsurance);
router.get('/me/insurance-applications', requireRole('Federation'), getInsuranceApplications);
router.patch('/me/insurance-applications/:appId/verify', requireRole('Federation'), verifyInsuranceApplication);

// A federation's own record, or any record for government officials
router.get('/:id', getFederationById);

// Only government officials can verify or reject a federation
router.patch('/:id/verify', requireRole('GovOfficial'), verifyFederation);

module.exports = router;
