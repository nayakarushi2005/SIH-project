const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { findNearby, sendMembershipError } = require('../services/membership');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// GET /api/federations/nearby  (app)
// Verified federations with the worker's PIN code, else in their city.
// → { match: 'pincode'|'city', federations: [{ id, name, city, pincode,
//     memberCount, match, myStatus }] }
// ────────────────────────────────────────────────────────────────────────────
router.get('/nearby', verifyToken, async (req, res) => {
  try {
    return res.status(200).json(await findNearby(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});

module.exports = router;
