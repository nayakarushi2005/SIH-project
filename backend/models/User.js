const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    googleEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    googleAvatar: {
      type: String,
      default: null,
    },

    name: {
      type: String,
      default: null,
    },
    dob: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      enum: ['M', 'F', 'T', null],
      default: null,
    },
    address: {
      type: String,
      default: null,
    },
    aadhaarNumber: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
      trim: true,
    },
    pincode: {
      type: String,
      default: null,
    },
    preferredLanguage: {
      type: String,
      default: 'en',
    },

    detailsSource: {
      type: String,
      enum: ['aadhaar', 'manual', null],
      default: null,
    },
    isAadhaarVerified: {
      type: Boolean,
      default: false,
    },
    aadhaarVerifiedAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
