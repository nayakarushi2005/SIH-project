const mongoose = require('mongoose');

/**
 * History between one client and one worker — an edge of the knowledge graph
 * that ranking reads directly. Written when feedback arrives; absent for
 * pairs that have never worked together.
 */
const affinitySchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    jobsTogether: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    rehire: { type: Boolean, default: null }, // "Would you hire again?"
    blocked: { type: Boolean, default: false }, // never offer this client's jobs to this worker
    lastJobAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

affinitySchema.index({ client: 1, worker: 1 }, { unique: true });

module.exports = mongoose.model('Affinity', affinitySchema);
