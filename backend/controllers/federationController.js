const Federation = require('../models/Federation');

// ── Register a new Federation ────────────────────────────────────────────────
const registerFederation = async (req, res) => {
  try {
    const { name, email, amount, noOfWorkers } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required fields.' });
    }

    // Check if email already exists
    const existing = await Federation.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ 
        message: 'A federation with this email already exists.',
        exists: true,
        federation: existing 
      });
    }

    // Auto-generate unique fedId (e.g., FED-1024)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const fedId = `FED-${randomSuffix}`;

    const federation = await Federation.create({
      fedId,
      name,
      email: email.toLowerCase(),
      amount: Number(amount) || 0,
      noOfWorkers: Number(noOfWorkers) || 0,
      workers: [], // Empty for now, to be added later
      status: 'unverified',
    });

    return res.status(201).json({
      message: 'Federation registration submitted successfully!',
      federation,
    });
  } catch (error) {
    console.error('Register Federation Error:', error);
    return res.status(500).json({ message: 'Failed to register federation', error: error.message });
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
      return res.status(200).json({ exists: true, federation });
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

    return res.status(200).json({ federation });
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

module.exports = {
  registerFederation,
  checkFederationByEmail,
  getAllFederations,
  getFederationById,
  verifyFederation,
};
