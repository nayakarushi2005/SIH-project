const express = require('express');
const router = express.Router();
const {
  registerFederation,
  checkFederationByEmail,
  getAllFederations,
  getFederationById,
  verifyFederation,
} = require('../controllers/federationController');

// Public route to register a new federation
router.post('/register', registerFederation);

// Check if federation exists by email
router.get('/check-email/:email', checkFederationByEmail);

// Route to get all registered federations
router.get('/all', getAllFederations);

// Route to get a specific federation by ID
router.get('/:id', getFederationById);

// Route for government officials to verify or reject a federation
router.patch('/:id/verify', verifyFederation);

module.exports = router;
