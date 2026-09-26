const Federation = require('../models/Federation');
const {
  decideRequest,
  listRequests,
  memberCount,
  removeMember,
  sendMembershipError,
} = require('../services/membership');

// ── Register / update the signed-in Federation's details ───────────────────
// The record was created at Google sign-in; this fills in the form. Always
// the caller's own record — never one looked up from the request body.
const registerFederation = async (req, res) => {
  try {
    const { name, amount, noOfWorkers, area } = req.body;
    const city = String(req.body.city ?? '').trim();
    const pincode = String(req.body.pincode ?? '').trim();

    const fields = {};
    if (city.length < 2 || city.length > 60) fields.city = 'Enter the city the federation works in.';
    if (!/^[1-9]\d{5}$/.test(pincode)) fields.pincode = 'Enter a valid 6-digit PIN code.';
    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ message: 'Please fix the highlighted fields.', fields });
    }

    const federation = await Federation.findById(req.user.userId);
    if (!federation) {
      return res.status(404).json({ message: 'No federation account found. Please sign in with Google again.' });
    }

    federation.name = name || federation.name;
    federation.amount = Number(amount) || federation.amount;
    federation.noOfWorkers = Number(noOfWorkers) || federation.noOfWorkers;
    federation.area = area || federation.area;
    federation.city = city;
    federation.pincode = pincode;
    // New or rejected federations go (back) to government review; updating
    // details must not un-verify an already verified one.
    if (federation.status !== 'verified') federation.status = 'unverified';

    await federation.save();

    return res.status(200).json({
      message: 'Federation registration completed successfully!',
      federation,
    });
  } catch (error) {
    console.error('Register Federation Error:', error);
    return res.status(500).json({ message: 'Failed to complete federation registration', error: error.message });
  }
};

// ── Check if Federation exists by Email ──────────────────────────────────────
const checkFederationByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ message: 'Email parameter is required.' });
    }

    const federation = await Federation.findOne({ email: email.toLowerCase() });

    if (federation) {
      return res.status(200).json({ exists: true, federation, memberCount: await memberCount(federation._id) });
    } else {
      return res.status(200).json({ exists: false, federation: null });
    }
  } catch (error) {
    console.error('Check Federation By Email Error:', error);
    return res.status(500).json({ message: 'Error checking federation email', error: error.message });
  }
};

// ── Get all Federations (with optional status filter) ────────────────────────
const getAllFederations = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status && ['unverified', 'verified', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const federations = await Federation.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      count: federations.length,
      federations,
    });
  } catch (error) {
    console.error('Get Federations Error:', error);
    return res.status(500).json({ message: 'Failed to fetch federations', error: error.message });
  }
};

// ── Get Federation by ID or fedId ────────────────────────────────────────────
const getFederationById = async (req, res) => {
  try {
    const { id } = req.params;
    const federation = await Federation.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { fedId: id }],
    });

    if (!federation) {
      return res.status(404).json({ message: 'Federation not found' });
    }

    return res.status(200).json({ federation, memberCount: await memberCount(federation._id) });
  } catch (error) {
    console.error('Get Federation By ID Error:', error);
    return res.status(500).json({ message: 'Error fetching federation details', error: error.message });
  }
};

// ── Verify or Reject Federation (Government Official Action) ─────────────────
const verifyFederation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['verified', 'rejected', 'unverified'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status provided. Must be verified or rejected.' });
    }

    const updateFields = {
      status,
      verifiedAt: status === 'verified' ? new Date() : null,
      rejectionReason: status === 'rejected' ? (rejectionReason || 'Rejected by administrator') : null,
    };

    const federation = await Federation.findByIdAndUpdate(id, updateFields, { new: true });

    if (!federation) {
      return res.status(404).json({ message: 'Federation not found' });
    }

    return res.status(200).json({
      message: `Federation status updated to ${status}`,
      federation,
    });
  } catch (error) {
    console.error('Verify Federation Error:', error);
    return res.status(500).json({ message: 'Failed to update verification status', error: error.message });
  }
};

// ── Worker join requests (federation portal) ────────────────────────────────

const listMyRequests = async (req, res) => {
  try {
    const requests = await listRequests(req.user.userId, req.query.status);
    return res.status(200).json({ requests });
  } catch (err) {
    return sendMembershipError(res, err, 'message');
  }
};

const decideMyRequest = async (req, res) => {
  const { action, reason } = req.body || {};
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Action must be accept or reject.' });
  }
  try {
    const request = await decideRequest(req.user.userId, req.params.id, action, reason);
    return res.status(200).json({ request });
  } catch (err) {
    return sendMembershipError(res, err, 'message');
  }
};

const removeMyMember = async (req, res) => {
  try {
    const request = await removeMember(req.user.userId, req.params.id);
    return res.status(200).json({ request });
  } catch (err) {
    return sendMembershipError(res, err, 'message');
  }
};

module.exports = {
  registerFederation,
  listMyRequests,
  decideMyRequest,
  removeMyMember,
  checkFederationByEmail,
  getAllFederations,
  getFederationById,
  verifyFederation,
};
