const mongoose = require('mongoose');

const federationWorkerSchema = new mongoose.Schema(
  {
    federation: { type: mongoose.Schema.Types.ObjectId, ref: 'Federation', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    aadhaarLast4: { type: String, required: true },
    photoUrl: { type: String, default: null },
    source: { type: String, enum: ['manual', 'import'], required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

federationWorkerSchema.index(
  { federation: 1, phone: 1 },
  {
    name: 'one_active_phone_per_federation',
    unique: true,
    partialFilterExpression: { status: 'active' },
  }
);

module.exports = mongoose.model('FederationWorker', federationWorkerSchema);
