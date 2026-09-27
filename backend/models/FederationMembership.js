const mongoose = require('mongoose');

const MEMBERSHIP_STATUSES = ['pending', 'verified', 'rejected', 'left', 'removed'];
const ACTIVE_STATUSES = ['pending', 'verified'];

/**
 * A worker's request to join a federation, and what became of it. A worker
 * has at most one pending-or-verified membership; finished ones (rejected,
 * left, removed) stay as history.
 */
const membershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    federation: { type: mongoose.Schema.Types.ObjectId, ref: 'Federation', required: true, index: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

membershipSchema.index(
  { user: 1 },
  {
    name: 'one_active_membership_per_user',
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } },
  }
);
// Latest membership per worker (profile summary).
membershipSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('FederationMembership', membershipSchema);
module.exports.MEMBERSHIP_STATUSES = MEMBERSHIP_STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
