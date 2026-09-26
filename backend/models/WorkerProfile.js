const mongoose = require('mongoose');

/**
 * The worker side of a User. A user becomes a worker by creating one of these;
 * the same account can still post jobs as a client. The worker's id in jobs,
 * ratings and (later) the knowledge graph is always their User id.
 */
const workerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // ── What the worker declares ────────────────────────────────────────
    skills: {
      type: [String], // service ids, e.g. ['plumber'] — see services/job.js
      required: true,
    },
    bio: {
      type: String,
      default: null,
    },
    experienceYears: {
      type: Number,
      default: null,
    },
    serviceRadiusKm: {
      type: Number, // how far the worker is willing to travel for a job
      default: 5,
    },

    // ── Presence (updated by the app while the worker is online) ────────
    isOnline: {
      type: Boolean,
      default: false,
    },
    // GeoJSON [lng, lat]. Absent until the worker first goes online — no
    // defaults here, since an empty point would break the 2dsphere index.
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    currentJob: {
      type: mongoose.Schema.Types.ObjectId, // set while the worker has an active job
      ref: 'Job',
      default: null,
    },

    // ── App metadata ────────────────────────────────────────────────────
    isActive: {
      type: Boolean, // false = suspended; never matched
      default: true,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

workerProfileSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('WorkerProfile', workerProfileSchema);
