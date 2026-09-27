const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

/**
 * A user's open safety shield: where they are, which blocks they're counted
 * in, and whether they have raised an SOS this time. One per user; deleted
 * when they close the shield (or by the dispatcher sweep once it goes quiet).
 *
 * mode STATIONARY → counted in every block within 50 m of `anchor`.
 * mode MOVING     → counted in their block and the next ones along `bearing`.
 */
const safetySessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },

    position: { type: pointSchema, required: true },
    geohash8: { type: String, required: true },

    mode: { type: String, enum: ['STATIONARY', 'MOVING'], default: 'STATIONARY' },
    anchor: { type: pointSchema, required: true },
    bearing: { type: Number, default: 0 },
    blocks: { type: [String], default: [] },

    activeAlert: { type: mongoose.Schema.Types.ObjectId, ref: 'SosAlert', default: null },
    sosRaised: { type: Boolean, default: false }, // any SOS this session — no safe-walk credit
  },
  { timestamps: true }
);

module.exports = mongoose.model('SafetySession', safetySessionSchema);
