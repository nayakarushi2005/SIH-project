const mongoose = require('mongoose');

/**
 * One SOS, from the moment it's raised until the user turns it off (or it
 * goes quiet and the dispatcher expires it). While `active`, shield users
 * within 2.5 km see it on their map and officials see it on the portal.
 * After it ends the user says whether it was real, which moves their trust.
 */
const sosAlertSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['active', 'ended', 'expired'], default: 'active' },
    trigger: {
      type: String,
      enum: ['button', 'call', 'voice', 'volume', 'notification'],
      default: 'button',
    },

    // Latest known position (GeoJSON, [lng, lat]) and the route since the SOS.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    path: {
      type: [{ lat: Number, lng: Number, at: Date, _id: false }],
      default: [],
    },

    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },

    trustAtStart: { type: Number, required: true },
    outcome: { type: String, enum: ['false_alarm', 'real_emergency', null], default: null },
    outcomeAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sosAlertSchema.index({ status: 1, lastSeenAt: -1 });
sosAlertSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SosAlert', sosAlertSchema);
