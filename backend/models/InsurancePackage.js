const mongoose = require('mongoose');

const insurancePackageSchema = new mongoose.Schema({
  policyId: {
    type: String,
    required: true,
    unique: true
  },
  federationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Federation',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  coverage: {
    type: String,
    required: true
  },
  premium: {
    type: String,
    required: true
  },
  interest: {
    type: String,
    default: '0%'
  },
  paperwork: {
    type: String,
    default: 'Minimal'
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'deprecated'],
    default: 'active'
  }
}, { timestamps: true });

module.exports = mongoose.model('InsurancePackage', insurancePackageSchema);
