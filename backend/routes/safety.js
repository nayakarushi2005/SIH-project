const express = require('express');
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const VoiceNote = require('../models/VoiceNote');
const { signVoiceNoteUpload } = require('../services/cloudinary');
const { sendError, splitFieldErrors } = require('../services/errors');
const safety = require('../services/safety');
const voiceNotes = require('../services/voiceNotes');

/**
 * The safety shield (app). The phone reports positions and SOS actions;
 * everything that matters — blocks, scores, alerts, trust — is decided here.
 * Most answers are the full shield status (services/safety.getStatus).
 */
const router = express.Router();
router.use(verifyToken);

function sendValidation(res, errors) {
  const { fields, fieldCodes, fieldParams } = splitFieldErrors(errors);
  const [first] = Object.values(fields);
  return res.status(400).json({ error: first, code: 'validation', fields, fieldCodes, fieldParams });
}

/** A location from the body, or null after sending a 400. */
function readPoint(res, value) {
  try {
    return safety.readPoint(value);
  } catch (thrown) {
    sendValidation(res, { location: thrown });
    return null;
  }
}

function handle(res, err, code, message) {
  if (err?.code && err?.message && !(err instanceof Error)) return sendValidation(res, { location: err });
  console.error(`Safety ${code}:`, err.message);
  return sendError(res, 500, code, message);
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/safety/me
// The shield status; also the app's poll while the shield is open, which
// keeps the session (and a running SOS) from being closed as abandoned.
// Response: { trust, session, block, sos, nearby, pendingOutcome }
// ────────────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const session = await safety.touchSession(req.user._id);
    return res.status(200).json(await safety.getStatus(req.user, new Date(), session));
  } catch (err) {
    return handle(res, err, 'safety_load_failed', 'Could not load the safety shield.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/safety/session           — open the shield (idempotent)
// POST /api/safety/session/location  — a new position while it's open
// Body: { location: { lat, lng } }
// ────────────────────────────────────────────────────────────────────────────
async function reportLocation(req, res) {
  const point = readPoint(res, req.body?.location);
  if (!point) return undefined;
  try {
    const session = await safety.updateLocation(req.user, point);
    return res.status(200).json(await safety.getStatus(req.user, new Date(), session));
  } catch (err) {
    return handle(res, err, 'safety_location_failed', 'Could not update your location.');
  }
}
router.post('/session', reportLocation);
router.post('/session/location', reportLocation);

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/safety/session
// Closes the shield (and any SOS still on).
// Response: { trust, safeWalk: { streak, bonus } | null, endedAlertId }
// ────────────────────────────────────────────────────────────────────────────
router.delete('/session', async (req, res) => {
  try {
    return res.status(200).json(await safety.endSession(req.user));
  } catch (err) {
    return handle(res, err, 'safety_end_failed', 'Could not close the safety shield.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/safety/sos
// Raises an SOS (idempotent while one is on).
// Body: { location?: { lat, lng }, trigger?: 'button'|'call'|'voice'|'volume'|'notification' }
// 400 (code safety_location_required) → no location and no open shield.
// ────────────────────────────────────────────────────────────────────────────
router.post('/sos', async (req, res) => {
  let point = null;
  if (req.body?.location !== undefined && req.body?.location !== null) {
    point = readPoint(res, req.body.location);
    if (!point) return undefined;
  }
  try {
    await safety.startSos(req.user, { point, trigger: req.body?.trigger });
    return res.status(201).json(await safety.getStatus(req.user));
  } catch (err) {
    return handle(res, err, 'sos_start_failed', 'Could not send your SOS. Call 112 if you are in danger.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/safety/sos
// Turns the SOS off. The app then asks "was it real?" for `endedAlertId`.
// ────────────────────────────────────────────────────────────────────────────
router.delete('/sos', async (req, res) => {
  try {
    const ended = await safety.stopSos(req.user);
    const status = await safety.getStatus(req.user);
    return res.status(200).json({ ...status, endedAlertId: ended?._id ?? null });
  } catch (err) {
    return handle(res, err, 'sos_stop_failed', 'Could not turn off your SOS.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/safety/sos/:id/outcome
// Body: { outcome: 'false_alarm' | 'real_emergency' } — counted once.
// 404 (code sos_outcome_not_found) → not this user's ended SOS, or already answered.
// ────────────────────────────────────────────────────────────────────────────
router.post('/sos/:id/outcome', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 404, 'sos_outcome_not_found', 'That SOS was not found or is already answered.');
  }
  try {
    const trust = await safety.recordOutcome(req.user, req.params.id, req.body?.outcome);
    if (!trust) {
      return sendError(res, 404, 'sos_outcome_not_found', 'That SOS was not found or is already answered.');
    }
    return res.status(200).json({ trust });
  } catch (err) {
    if (err?.code === 'safety_outcome_invalid') return sendValidation(res, { outcome: err });
    return handle(res, err, 'sos_outcome_failed', 'Could not save your answer.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/safety/voice/sign
// Signs a direct-to-Cloudinary upload for one voice note (see uploads.js).
// ────────────────────────────────────────────────────────────────────────────
router.post('/voice/sign', (req, res) => {
  try {
    return res.status(200).json(signVoiceNoteUpload(req.user._id));
  } catch (err) {
    console.error('Voice sign error:', err.message);
    return sendError(res, 500, 'voice_upload_unavailable', 'Voice notes can’t be uploaded right now.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/safety/voice
// Registers an uploaded voice note; analysis runs in the background.
// Body: { audioUrl, durationMs?, location?: { lat, lng } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/voice', async (req, res) => {
  const errors = voiceNotes.readVoiceNote(req.body, req.user._id);
  let point = null;
  if (req.body?.location) {
    try {
      point = safety.readPoint(req.body.location);
    } catch (thrown) {
      errors.location = thrown;
    }
  }
  if (Object.keys(errors).length > 0) return sendValidation(res, errors);

  try {
    const note = await voiceNotes.createVoiceNote(req.user, {
      audioUrl: req.body.audioUrl,
      durationMs: req.body.durationMs,
      point,
    });
    return res.status(201).json(voiceNotes.toVoiceNote(note));
  } catch (err) {
    return handle(res, err, 'voice_note_failed', 'Could not save your voice note.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/safety/voice — the user's own voice notes, newest first.
// ────────────────────────────────────────────────────────────────────────────
router.get('/voice', async (req, res) => {
  try {
    const notes = await VoiceNote.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    return res.status(200).json({ notes: notes.map(voiceNotes.toVoiceNote) });
  } catch (err) {
    return handle(res, err, 'voice_notes_load_failed', 'Could not load your voice notes.');
  }
});

module.exports = router;
