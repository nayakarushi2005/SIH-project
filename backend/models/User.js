const mongoose = require('mongoose');

/**
 * User schema — fields are sourced from:
 *   - Google Auth  : googleId, googleEmail, googleAvatar
 *   - Aadhaar eKYC : name, dob, gender, address, aadhaarNumber
 *   - The user     : phone, city, pincode, preferredLanguage — and name, dob,
 *                    gender, address when entered manually before verification
 */
const userSchema = new mongoose.Schema(
  {
    // ── Google Auth fields ──────────────────────────────────────────────
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
      type: String, // profile picture URL from Google
      default: null,
    },

    // ── Aadhaar eKYC fields (populated after verification) ─────────────
    name: {
      type: String, // Name exactly as on Aadhaar card
      default: null,
    },
    dob: {
      type: String, // Date of Birth from Aadhaar (e.g. "DD/MM/YYYY")
      default: null,
    },
    gender: {
      type: String, // from Aadhaar demographic data
      enum: ['M', 'F', 'T', null],
      default: null,
    },
    address: {
      type: String, // Full address from Aadhaar
      default: null,
    },
    aadhaarNumber: {
      type: String,
      // Stored as last 4 digits only (XXXX-XXXX-1234) for privacy compliance
      // Full number is NEVER stored — only last 4 digits
      default: null,
    },

    // ── Contact & preferences (entered by the user) ────────────────────
    phone: {
      type: String, // 10-digit Indian mobile number, without +91
      default: null,
    },
    city: {
      type: String,
      default: null,
      trim: true,
    },
    pincode: {
      type: String, // 6-digit Indian PIN code
      default: null,
    },
    preferredLanguage: {
      type: String, // ISO 639-1 code, e.g. 'en', 'hi'
      default: 'en',
    },

    // ── Verification status ─────────────────────────────────────────────
    // Where name/dob/gender/address came from. 'manual' details are
    // self-declared and get overwritten once Aadhaar verification succeeds.
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

    // ── App metadata ────────────────────────────────────────────────────
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
    timestamps: true, // adds createdAt, updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
