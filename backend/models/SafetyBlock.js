const mongoose = require('mongoose');

/**
 * One geohash-8 block (~38 × 19 m) of the safety map. SOS reports lower its
 * score (services/safetyTrust.js); the score is worked out on read from
 * `weightedImpact` and `lastSosAt`, so it recovers on its own over time.
 * `activeUsers` are the shield users currently counted in this block.
 * A block with no reports and nobody in it is deleted.
 */
const safetyBlockSchema = new mongoose.Schema(
  {
    geohash: { type: String, required: true, unique: true },
    sosCount: { type: Number, default: 0 },
    weightedImpact: { type: Number, default: 0 },
    lastSosAt: { type: Date, default: null },
    activeUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

safetyBlockSchema.index({ sosCount: -1 });

module.exports = mongoose.model('SafetyBlock', safetyBlockSchema);
