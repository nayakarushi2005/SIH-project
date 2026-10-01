const mongoose = require('mongoose');

/**
 * Where a worker's earnings are paid. The full account number is never
 * stored: in 'route' mode Razorpay keeps it inside the linked account, and we
 * only keep what the app needs to show ("SBI ****4821").
 */
const payoutAccountSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    holderName: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankName: { type: String, default: null },
    branch: { type: String, default: null },
    accountLast4: { type: String, required: true },

    status: {
      type: String,
      enum: ['ACTIVE', 'FAILED'],
      default: 'ACTIVE',
    },
    mode: { type: String, enum: ['route', 'simulated'], required: true },
    razorpayAccountId: { type: String, default: null }, // acc_… in 'route' mode
    failureReason: { type: String, default: null },

    // After the details change, payouts wait until this time — so someone who
    // takes over an account can't quietly redirect the worker's money.
    holdPayoutsUntil: { type: Date, default: null },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

module.exports = mongoose.model('PayoutAccount', payoutAccountSchema);
