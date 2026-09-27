const mongoose = require('mongoose');

/**
 * "The work this worker has done well" in one trade, as an embedding: the
 * rating- and recency-weighted average of the descriptions of their completed
 * jobs in that category. Ranking compares a new job's description against it
 * (services/relevance.js). Rebuilt from scratch after feedback, like the
 * knowledge graph edges.
 */
const workerVectorSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    vector: {
      type: Buffer, // float32 — see services/vectors.js
      required: true,
    },
    jobs: {
      type: Number, // completed jobs behind the vector — how much to trust it
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

workerVectorSchema.index({ worker: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('WorkerVector', workerVectorSchema);
