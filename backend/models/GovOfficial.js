const mongoose = require('mongoose');

const govOfficialSchema = new mongoose.Schema(
  {
    // ── Google Auth fields ──────────────────────────────────────────────
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('GovOfficial', govOfficialSchema);
