const express = require('express');
const mongoose = require('mongoose');
const { ensureAuth } = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const SafetyBlock = require('../models/SafetyBlock');
const SosAlert = require('../models/SosAlert');
const VoiceNote = require('../models/VoiceNote');
const { blockScore } = require('../services/safetyTrust');
const { toVoiceNote } = require('../services/voiceNotes');
const { sendError } = require('../services/errors');
const ngeohash = require('ngeohash');

/**
 * Safety shield for government officials (web portal): live SOS alerts with
 * who raised them, their voice notes with the AI triage, and the blocks with
 * the most reports.
 */
const router = express.Router();
router.use(ensureAuth, requireRole('GovOfficial'));

const RECENT_MS = 24 * 60 * 60 * 1000;
const USER_FIELDS = 'name phone googleAvatar isAadhaarVerified safety';

function toPerson(user) {
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    avatar: user.googleAvatar,
    isVerified: !!user.isAadhaarVerified,
    trustScore: user.safety?.trustScore ?? 5,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gov/safety/alerts?scope=active|recent
// active (default): SOS alerts on now. recent: anything from the last 24 h.
// ────────────────────────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  const filter =
    req.query.scope === 'recent'
      ? { startedAt: { $gte: new Date(Date.now() - RECENT_MS) } }
      : { status: 'active' };
  try {
    const alerts = await SosAlert.find(filter)
      .sort({ startedAt: -1 })
      .limit(100)
      .populate('user', USER_FIELDS)
      .lean();
    const noteCounts = await VoiceNote.aggregate([
      { $match: { alert: { $in: alerts.map((a) => a._id) } } },
      { $group: { _id: '$alert', count: { $sum: 1 } } },
    ]);
    const counts = new Map(noteCounts.map((n) => [String(n._id), n.count]));

    return res.status(200).json({
      alerts: alerts.map((a) => {
        const [lng, lat] = a.location.coordinates;
        return {
          id: a._id,
          status: a.status,
          trigger: a.trigger,
          location: { lat, lng },
          path: a.path,
          startedAt: a.startedAt,
          lastSeenAt: a.lastSeenAt,
          endedAt: a.endedAt,
          outcome: a.outcome,
          trustAtStart: a.trustAtStart,
          voiceNotes: counts.get(String(a._id)) ?? 0,
          user: toPerson(a.user),
        };
      }),
    });
  } catch (err) {
    console.error('Gov safety alerts error:', err.message);
    return sendError(res, 500, 'safety_alerts_failed', 'Could not load SOS alerts.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gov/safety/voice-notes?unheard=1 — newest first.
// ────────────────────────────────────────────────────────────────────────────
router.get('/voice-notes', async (req, res) => {
  const filter = req.query.unheard === '1' ? { listenedAt: null } : {};
  try {
    const notes = await VoiceNote.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', USER_FIELDS)
      .lean();
    return res.status(200).json({
      notes: notes.map((n) => ({ ...toVoiceNote(n), user: toPerson(n.user) })),
    });
  } catch (err) {
    console.error('Gov voice notes error:', err.message);
    return sendError(res, 500, 'voice_notes_load_failed', 'Could not load voice notes.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/gov/safety/voice-notes/:id/listened
// ────────────────────────────────────────────────────────────────────────────
router.patch('/voice-notes/:id/listened', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 404, 'voice_note_not_found', 'Voice note not found.');
  }
  try {
    const note = await VoiceNote.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { listenedAt: new Date(), listenedBy: req.user.userId } },
      { new: true }
    ).lean();
    if (!note) return sendError(res, 404, 'voice_note_not_found', 'Voice note not found.');
    return res.status(200).json(toVoiceNote(note));
  } catch (err) {
    console.error('Gov voice note listened error:', err.message);
    return sendError(res, 500, 'voice_note_update_failed', 'Could not update the voice note.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gov/safety/blocks — the 50 blocks with the lowest safety score.
// ────────────────────────────────────────────────────────────────────────────
router.get('/blocks', async (req, res) => {
  try {
    const now = new Date();
    const blocks = await SafetyBlock.find({ sosCount: { $gt: 0 } })
      .sort({ sosCount: -1 })
      .limit(500)
      .select('geohash sosCount weightedImpact lastSosAt')
      .lean();
    return res.status(200).json({
      blocks: blocks
        .map((b) => {
          const { latitude, longitude } = ngeohash.decode(b.geohash);
          return {
            geohash: b.geohash,
            center: { lat: latitude, lng: longitude },
            sosCount: b.sosCount,
            score: blockScore(b.weightedImpact, b.lastSosAt, now),
            lastSosAt: b.lastSosAt,
          };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 50),
    });
  } catch (err) {
    console.error('Gov safety blocks error:', err.message);
    return sendError(res, 500, 'safety_blocks_failed', 'Could not load the safety map.');
  }
});

module.exports = router;
