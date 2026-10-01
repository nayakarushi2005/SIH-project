const mongoose = require('mongoose');

/**
 * A voice note recorded from the safety shield. The app uploads the audio
 * straight to Cloudinary (signed, pinned to the user's folder); the
 * dispatcher then has Gemini transcribe it and rate how urgent it sounds,
 * and officials listen to it on the portal.
 */
const voiceNoteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    alert: { type: mongoose.Schema.Types.ObjectId, ref: 'SosAlert', default: null },
    audioUrl: { type: String, required: true },
    durationMs: { type: Number, default: null },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    analysis: {
      // pending → waiting for the dispatcher; skipped → no LLM configured
      status: {
        type: String,
        enum: ['pending', 'done', 'failed', 'skipped'],
        default: 'pending',
        index: true,
      },
      transcript: { type: String, default: null },
      urgency: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null], default: null },
      summary: { type: String, default: null },
      pattern: { type: String, default: null },
      actionItems: { type: [String], default: [] },
      error: { type: String, default: null },
      analyzedAt: { type: Date, default: null },
    },

    listenedAt: { type: Date, default: null },
    listenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GovOfficial', default: null },
  },
  { timestamps: true }
);

voiceNoteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('VoiceNote', voiceNoteSchema);
