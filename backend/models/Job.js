const mongoose = require('mongoose');
const { LANGUAGES } = require('../services/profile');

/**
 * A job posted by a client. This document is the source of truth for the
 * job's lifecycle; the dispatcher only ever carries its id.
 *
 *   SEARCHING → ASSIGNED → IN_PROGRESS → COMPLETED
 *     ↑   ↓   ←─────┘ (worker withdraws within the cancellation window)
 *     │ EXPIRED (no taker before the search deadline)
 *     └───┘ (client retries: same details, a higher price, or edited)
 *
 *   SEARCHING and ASSIGNED can also go to CANCELLED (by the client).
 */
const jobSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── What the client posted ──────────────────────────────────────────
    category: {
      type: String, // a service id, e.g. 'plumber' — see services/job.js
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    photos: {
      type: [String], // Cloudinary secure URLs, uploaded directly by the app
      required: true,
    },
    price: {
      type: Number, // whole rupees the client offers
      required: true,
    },
    expectedDurationMins: {
      type: Number,
      required: true,
    },
    location: {
      // GeoJSON — coordinates are [lng, lat], not [lat, lng]
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    address: {
      type: String, // optional landmark / flat details for the worker
      default: null,
    },
    language: {
      type: String,
      enum: LANGUAGES,
      default: 'en',
    },
    postedVia: {
      type: String,
      enum: ['form', 'voice'],
      default: 'form',
    },

    // Snapshot of the client's verification when they posted, read from
    // their User document — never taken from the request body.
    clientAadhaarVerified: {
      type: Boolean,
      required: true,
    },

    // Embedding of "<category>: <description>" (float32 — services/vectors.js),
    // written by the dispatcher before ranking. Never loaded unless asked for.
    embedding: {
      type: Buffer,
      select: false,
    },

    // ── Lifecycle ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
      default: 'SEARCHING',
    },
    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    // Shown only to the client; the worker enters it on arrival to start the
    // job, proving they're actually there (like a ride OTP).
    startCode: {
      type: String,
      default: null,
    },
    startCodeAttempts: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    feedbackAt: {
      type: Date, // when the client rated the worker (see models/Feedback.js)
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },

    // ── Dispatch (written by the dispatcher — see services/dispatch.js) ──
    dispatch: {
      round: {
        type: Number, // last round that sent offers; -1 = not dispatched yet
        default: -1,
      },
      firstRound: {
        type: Number, // round the current search started at — moves on when an assigned worker withdraws
        default: 0,
      },
      searchDeadline: {
        type: Date, // the current search expires the job at this time — see services/dispatch.js
        default: null,
      },
      offers: [
        {
          _id: false,
          worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          round: { type: Number, required: true },
          score: { type: Number, default: null }, // ranking score, kept for tuning
          distanceMeters: { type: Number, default: null },
          offeredAt: { type: Date, required: true },
          expiresAt: { type: Date, required: true },
          response: {
            type: String,
            enum: ['accepted', 'rejected', 'withdrawn', null], // withdrawn = accepted, then backed out
            default: null,
          },
          respondedAt: { type: Date, default: null },
          // Why the worker withdrew (services/job.js WITHDRAW_REASONS), plus
          // their own words when the reason is 'other'.
          withdrawReason: { type: String, default: null },
          withdrawNote: { type: String, default: null },
        },
      ],
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

jobSchema.index({ location: '2dsphere' });
jobSchema.index({ client: 1, createdAt: -1 });
jobSchema.index({ 'dispatch.offers.worker': 1, status: 1 }); // a worker's open offers
jobSchema.index({ status: 1, 'dispatch.searchDeadline': 1 }); // the dispatcher's overdue-search sweep

module.exports = mongoose.model('Job', jobSchema);
