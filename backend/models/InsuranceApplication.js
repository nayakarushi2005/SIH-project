const mongoose = require('mongoose');
const { Schema } = mongoose;

const insuranceApplicationSchema = new Schema({
  workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation', required: true },
  packageId: { type: Schema.Types.Mixed, required: true },
  packageName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  appliedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InsuranceApplication', insuranceApplicationSchema);
