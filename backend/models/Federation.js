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
    area: {
      type: String,
      default: '',
      trim: true,
    },
    // Where the federation works. Workers see federations with their PIN,
    // or in their city when none share it.
    city: {
      type: String,
      default: '',
      trim: true,
    },
    pincode: {
      type: String, // 6-digit Indian PIN code
      default: '',
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

federationSchema.index({ status: 1, pincode: 1 });

module.exports = mongoose.model('Federation', federationSchema);
