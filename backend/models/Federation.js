const mongoose = require('mongoose');

const federationSchema = new mongoose.Schema(
  {
    fedId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    noOfWorkers: {
      type: Number,
      required: true,
      default: 0,
    },
    workers: {
      type: Array,
      default: [], // Empty array for now as requested; workers will be populated later
    },
    status: {
      type: String,
      enum: ['unverified', 'verified', 'rejected'],
      default: 'unverified',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Federation', federationSchema);
