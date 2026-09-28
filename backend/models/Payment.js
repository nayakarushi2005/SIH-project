const mongoose = require('mongoose');

/**
 * What a client owes, and has paid, for one completed job — and the worker's
 * share of it. Created on first look after the job is COMPLETED (see
 * services/payment.js ensurePayment); the Job document is left untouched.
 *
 *   PENDING → PAID   (online through Razorpay, or cash the worker confirms)
 *
 * Once PAID the worker's share is paid out (payout.status), and a receipt
 * number is issued. All amounts are whole paise.
 */
const paymentSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      unique: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Amounts (from job.price, never from a request) ──────────────────
    amountPaise: { type: Number, required: true },
    platformFeePaise: { type: Number, required: true },
    workerAmountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    // ── Collection ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['PENDING', 'PAID'],
      default: 'PENDING',
    },
    method: {
      type: String,
      enum: ['online', 'cash', null],
      default: null,
    },
    razorpay: {
      orderId: { type: String, default: null },
      paymentId: { type: String, default: null },
      method: { type: String, default: null }, // upi, card, netbanking, …
    },
    lastFailure: {
      type: String, // Razorpay's reason for the last failed online attempt
      default: null,
    },
    paidAt: { type: Date, default: null },

    // ── Worker payout (services/payment.js settlePayout) ────────────────
    payout: {
      status: {
        type: String,
        // NOT_APPLICABLE: cash went to the worker directly.
        // PENDING: waiting for a payout account, or its change cooldown.
        // PROCESSING: claimed by settlePayout, so a transfer is never sent twice.
        enum: ['NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'SETTLED', 'FAILED'],
        default: 'PENDING',
      },
      mode: { type: String, enum: ['route', 'simulated', null], default: null },
      transferId: { type: String, default: null },
      accountLast4: { type: String, default: null },
      settledAt: { type: Date, default: null },
      error: { type: String, default: null },
    },

    // ── Receipt (issued when PAID) ──────────────────────────────────────
    receipt: {
      number: { type: String, default: null }, // e.g. RCPT-2026-000042
      issuedAt: { type: Date, default: null },
    },

    // What the receipt prints, frozen when the payment is created so a later
    // profile edit can't change an issued receipt.
    snapshot: {
      category: String,
      description: String,
      clientName: String,
      workerName: String,
      completedAt: Date,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

paymentSchema.index({ worker: 1, createdAt: -1 }); // a worker's earnings
paymentSchema.index({ 'razorpay.orderId': 1 }); // webhooks find the payment by order
paymentSchema.index({ 'payout.status': 1, worker: 1 }); // payouts still to settle

module.exports = mongoose.model('Payment', paymentSchema);
