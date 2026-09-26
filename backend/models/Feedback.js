const mongoose = require('mongoose');

/**
 * A client's feedback on the worker who completed their job — the raw input
 * the knowledge graph is built from (services/graph.js). One per job.
 */
const feedbackSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, unique: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true }, // the job's service id, e.g. 'electrician'

    rating: { type: Number, required: true, min: 1, max: 5 },
    praised: { type: [String], default: [] }, // trait ids — see services/traits.js
    criticized: { type: [String], default: [] }, // trait ids
    rehire: { type: Boolean, default: null }, // "Would you hire them again?"
    block: { type: Boolean, default: false }, // "Don't send me this worker again"
    comment: { type: String, default: null }, // stored for later text analysis

    // Set once the graph has been rebuilt from this feedback; the dispatcher
    // sweeps up feedback left unprocessed (e.g. Redis was down).
    processedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

feedbackSchema.index({ worker: 1, createdAt: -1 });
feedbackSchema.index({ client: 1, createdAt: -1 });
feedbackSchema.index({ processedAt: 1, createdAt: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
