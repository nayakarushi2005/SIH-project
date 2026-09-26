const mongoose = require('mongoose');

/**
 * Running totals about one worker, kept up to date incrementally ($inc) as
 * things happen, so ranking only ever reads numbers. Missing document = a
 * new worker with no history; ranking fills in priors.
 */
const workerStatsSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId, // User id
      ref: 'User',
      required: true,
      unique: true,
    },

    // Ratings from completed jobs (feedback)
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Completed jobs per service id, e.g. { plumber: 12 }
    completedByCategory: { type: Map, of: Number, default: {} },
    completedTotal: { type: Number, default: 0 },

    // Offer behaviour — an offer that times out counts as not accepted
    offersReceived: { type: Number, default: 0 },
    offersAccepted: { type: Number, default: 0 },
    withdrawals: { type: Number, default: 0 }, // accepted, then backed out before starting

    // Jobs assigned on `assignedDay` (YYYY-MM-DD, IST), for spreading work
    assignedDay: { type: String, default: null },
    assignedToday: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WorkerStats', workerStatsSchema);
