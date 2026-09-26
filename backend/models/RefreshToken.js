const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'userModel',
    },
    userModel: {
      type: String,
      required: true,
      enum: ['Federation', 'GovOfficial'], 
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, 
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
