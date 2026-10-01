const SafetyBlock = require('../models/SafetyBlock');
const SafetySession = require('../models/SafetySession');
const SosAlert = require('../models/SosAlert');
const User = require('../models/User');
const { fieldError } = require('./errors');
const geo = require('./safetyGeo');
const trust = require('./safetyTrust');

/**
 * The safety shield: a user opens it, the phone reports its position, and
 * the server keeps track of which map blocks they're in, their SOS alerts
 * and their trust score. The phone never writes any of that directly.
 */

const NEARBY_RADIUS_M = 2500; // SOS alerts shown to shield users within this distance
const NEARBY_LIMIT = 20;
const MONGO_EARTH_RADIUS_M = 6378100; // what $centerSphere radians are measured against
const PATH_LIMIT = 500; // positions kept per SOS
const SESSION_QUIET_MS = 30 * 60 * 1000; // no position or poll this long → shield closed
const ALERT_QUIET_MS = 2 * 60 * 60 * 1000; // an SOS nobody updates this long → expired
const MIN_SAFE_WALK_MS = 10 * 60 * 1000; // shorter sessions earn no safe-walk credit
const OUTCOME_WINDOW_MS = 24 * 60 * 60 * 1000; // how long "was it real?" stays askable

const OUTCOMES = ['false_alarm', 'real_emergency'];
const TRIGGERS = ['button', 'call', 'voice', 'volume', 'notification'];

/** { lat, lng } from a request body, or throws a coded field error. */
function readPoint(value) {
  const { lat, lng } = value || {};
  const valid =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!valid) {
    throw fieldError('safety_location_invalid', 'We couldn’t read your location. Please allow location access.');
  }
  return { lat, lng };
}

const toGeoJson = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });

// ── Blocks ──────────────────────────────────────────────────────────────────

async function joinBlocks(userId, hashes) {
  if (hashes.length === 0) return;
  await SafetyBlock.bulkWrite(
    hashes.map((geohash) => ({
      updateOne: {
        filter: { geohash },
        update: { $addToSet: { activeUsers: userId } },
        upsert: true,
      },
    }))
  );
}

async function leaveBlocks(userId, hashes) {
  if (hashes.length === 0) return;
  await SafetyBlock.updateMany({ geohash: { $in: hashes } }, { $pull: { activeUsers: userId } });
  // Keep only blocks that are occupied or have a history.
  await SafetyBlock.deleteMany({ geohash: { $in: hashes }, sosCount: 0, activeUsers: { $size: 0 } });
}

/**
 * Records one SOS in `geohash`, atomically: fades the stored impact to now
 * and adds this user's weight (safetyTrust.impactAfterSos, as a pipeline).
 */
async function recordSosInBlock(geohash, trustScore, now) {
  const hours = {
    $divide: [{ $subtract: [now, { $ifNull: ['$lastSosAt', now] }] }, trust.MS_PER_HOUR],
  };
  const faded = {
    $multiply: [
      { $ifNull: ['$weightedImpact', 0] },
      { $exp: { $multiply: [-trust.IMPACT_DECAY_PER_HOUR, hours] } },
    ],
  };
  await SafetyBlock.updateOne(
    { geohash },
    [
      {
        $set: {
          weightedImpact: { $add: [faded, trust.sosWeight(trustScore, now)] },
          sosCount: { $add: [{ $ifNull: ['$sosCount', 0] }, 1] },
          lastSosAt: now,
          activeUsers: { $ifNull: ['$activeUsers', []] },
        },
      },
    ],
    { upsert: true }
  );
}

function toBlock(block, geohash, now) {
  return {
    geohash,
    bounds: geo.bounds(geohash),
    score: block ? trust.blockScore(block.weightedImpact, block.lastSosAt, now) : 10,
    sosCount: block?.sosCount ?? 0,
  };
}

// ── Session ─────────────────────────────────────────────────────────────────

async function createSession(user, point, now) {
  const blocks = geo.stationaryBlocks(point.lat, point.lng);
  try {
    const session = await SafetySession.create({
      user: user._id,
      startedAt: now,
      lastSeenAt: now,
      position: point,
      geohash8: geo.geohash8(point.lat, point.lng),
      anchor: point,
      blocks,
    });
    await joinBlocks(user._id, blocks);
    return session;
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Opened twice at once (e.g. the screen and the background task).
    return SafetySession.findOne({ user: user._id });
  }
}

/**
 * Moves the user's shield to `point`, creating it if needed. Standing still
 * they're counted in every block within 50 m; once they're 15 m from where
 * they started they're counted along their path instead. While an SOS is on,
 * it follows them and each new block they enter gets the SOS recorded too.
 */
async function updateLocation(user, point, now = new Date()) {
  const session = await SafetySession.findOne({ user: user._id });
  if (!session) return createSession(user, point, now);

  const { lat, lng } = point;
  const geohash8 = geo.geohash8(lat, lng);
  const previous = session.position;
  let blocks = session.blocks;

  if (session.mode === 'STATIONARY') {
    const { anchor } = session;
    if (geo.distanceM(anchor.lat, anchor.lng, lat, lng) >= geo.MOVING_THRESHOLD_M) {
      session.mode = 'MOVING';
      session.bearing = geo.bearingDeg(anchor.lat, anchor.lng, lat, lng);
      blocks = geo.forwardBlocks(lat, lng, session.bearing);
    }
  } else {
    if (geo.distanceM(previous.lat, previous.lng, lat, lng) > geo.BEARING_MIN_STEP_M) {
      session.bearing = geo.bearingDeg(previous.lat, previous.lng, lat, lng);
    }
    blocks = geo.evaluateWindow(geohash8, session.blocks, lat, lng, session.bearing).window;
  }

  const { toAdd, toRemove } = geo.diffBlocks(session.blocks, blocks);
  const enteredNewBlock = geohash8 !== session.geohash8;

  session.blocks = blocks;
  session.position = point;
  session.geohash8 = geohash8;
  session.lastSeenAt = now;
  await session.save();
  await joinBlocks(user._id, toAdd);
  await leaveBlocks(user._id, toRemove);

  if (session.activeAlert) {
    const alert = await SosAlert.findOneAndUpdate(
      { _id: session.activeAlert, status: 'active' },
      {
        $set: { location: toGeoJson(point), lastSeenAt: now },
        $push: { path: { $each: [{ lat, lng, at: now }], $slice: -PATH_LIMIT } },
      },
      { new: true }
    );
    if (alert && enteredNewBlock) await recordSosInBlock(geohash8, alert.trustAtStart, now);
  }
  return session;
}

/** The app's poll while the shield is open: proves the phone is still there. */
async function touchSession(userId, now = new Date()) {
  const session = await SafetySession.findOneAndUpdate(
    { user: userId },
    { $set: { lastSeenAt: now } },
    { new: true }
  );
  if (session?.activeAlert) {
    await SosAlert.updateOne(
      { _id: session.activeAlert, status: 'active' },
      { $set: { lastSeenAt: now } }
    );
  }
  return session;
}

/** Ends all of the user's active alerts; returns the newest one ended, if any. */
async function endActiveAlerts(userId, now) {
  const active = await SosAlert.find({ user: userId, status: 'active' }).sort({ startedAt: -1 });
  if (active.length === 0) return null;
  await SosAlert.updateMany(
    { _id: { $in: active.map((a) => a._id) }, status: 'active' },
    { $set: { status: 'ended', endedAt: now } }
  );
  return active[0];
}

/**
 * Closes the shield. A walk of at least 10 minutes with no SOS counts
 * towards the safe-walk streak. An SOS still on is turned off.
 */
async function endSession(user, now = new Date()) {
  const session = await SafetySession.findOneAndDelete({ user: user._id });
  const endedAlert = await endActiveAlerts(user._id, now);
  if (!session) {
    return { trust: trust.readTrust(user), safeWalk: null, endedAlertId: endedAlert?._id ?? null };
  }

  await leaveBlocks(user._id, session.blocks);

  let safeWalk = null;
  let current = trust.readTrust(user);
  if (!session.sosRaised && now - session.startedAt >= MIN_SAFE_WALK_MS) {
    const next = trust.applySafeWalk(current, user.isAadhaarVerified);
    current = { trustScore: next.trustScore, safeWalkStreak: next.safeWalkStreak, falseSosCount: next.falseSosCount };
    await saveTrust(user._id, current);
    safeWalk = { streak: next.safeWalkStreak, bonus: next.bonus };
  }
  return { trust: current, safeWalk, endedAlertId: endedAlert?._id ?? null };
}

// ── SOS ─────────────────────────────────────────────────────────────────────

/**
 * Raises an SOS at the user's position (`point`, or the shield's last one).
 * Already on → returns the running alert. Lowers the score of the block
 * they're in by an amount that depends on their trust and the hour.
 */
async function startSos(user, { point, trigger }, now = new Date()) {
  let session = point
    ? await updateLocation(user, point, now)
    : await SafetySession.findOne({ user: user._id });
  if (!session) {
    throw fieldError('safety_location_required', 'We need your location to send an SOS.');
  }

  if (session.activeAlert) {
    const running = await SosAlert.findOne({ _id: session.activeAlert, status: 'active' });
    if (running) return running;
    await SafetySession.updateOne(
      { _id: session._id, activeAlert: session.activeAlert },
      { $set: { activeAlert: null } }
    );
  }

  const { trustScore } = trust.readTrust(user);
  const { lat, lng } = session.position;
  const alert = await SosAlert.create({
    user: user._id,
    trigger: TRIGGERS.includes(trigger) ? trigger : 'button',
    location: toGeoJson(session.position),
    path: [{ lat, lng, at: now }],
    startedAt: now,
    lastSeenAt: now,
    trustAtStart: trustScore,
  });

  // Claim the session's alert slot; a simultaneous SOS (two triggers at once) loses.
  session = await SafetySession.findOneAndUpdate(
    { _id: session._id, activeAlert: null },
    { $set: { activeAlert: alert._id, sosRaised: true } },
    { new: true }
  );
  if (!session) {
    await SosAlert.deleteOne({ _id: alert._id });
    const current = await SafetySession.findOne({ user: user._id });
    return SosAlert.findById(current?.activeAlert);
  }

  await recordSosInBlock(session.geohash8, trustScore, now);
  return alert;
}

/** Turns the user's SOS off. Returns the alert that ended, or null. */
async function stopSos(user, now = new Date()) {
  await SafetySession.updateOne({ user: user._id }, { $set: { activeAlert: null } });
  return endActiveAlerts(user._id, now);
}

async function saveTrust(userId, { trustScore, safeWalkStreak, falseSosCount }) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'safety.trustScore': trustScore,
        'safety.safeWalkStreak': safeWalkStreak,
        'safety.falseSosCount': falseSosCount,
      },
    }
  );
}

/**
 * The user's answer to "was it real?" for an ended SOS. Counted once:
 * a false alarm cuts their trust, a real emergency raises it. Returns the
 * new trust, or null if the alert isn't theirs or was already answered.
 */
async function recordOutcome(user, alertId, outcome, now = new Date()) {
  if (!OUTCOMES.includes(outcome)) {
    throw fieldError('safety_outcome_invalid', 'Choose whether it was a false alarm or a real emergency.');
  }
  const alert = await SosAlert.findOneAndUpdate(
    { _id: alertId, user: user._id, status: { $in: ['ended', 'expired'] }, outcome: null },
    { $set: { outcome, outcomeAt: now } },
    { new: true }
  );
  if (!alert) return null;

  const fresh = await User.findById(user._id).select('safety').lean();
  const current = trust.readTrust(fresh);
  const next = outcome === 'false_alarm' ? trust.applyFalseAlarm(current) : trust.applyRealEmergency(current);
  await saveTrust(user._id, next);
  return next;
}

// ── What the app shows ──────────────────────────────────────────────────────

/** Active SOS alerts of other users within 2.5 km of `point`, nearest first. */
async function nearbyAlerts(userId, point, now = new Date()) {
  const alerts = await SosAlert.find({
    status: 'active',
    user: { $ne: userId },
    lastSeenAt: { $gte: new Date(now - ALERT_QUIET_MS) },
    location: {
      $geoWithin: { $centerSphere: [[point.lng, point.lat], NEARBY_RADIUS_M / MONGO_EARTH_RADIUS_M] },
    },
  })
    .select('location startedAt lastSeenAt')
    .lean();

  return alerts
    .map((a) => {
      const [lng, lat] = a.location.coordinates;
      return {
        id: a._id,
        lat,
        lng,
        distanceM: Math.round(geo.distanceM(point.lat, point.lng, lat, lng)),
        startedAt: a.startedAt,
        lastSeenAt: a.lastSeenAt,
      };
    })
    .filter((a) => a.distanceM <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, NEARBY_LIMIT);
}

/** Other shield users counted in the same blocks as this session. */
async function companionsNearby(session) {
  const blocks = await SafetyBlock.find({ geohash: { $in: session.blocks } })
    .select('activeUsers')
    .lean();
  const others = new Set();
  for (const block of blocks) {
    for (const id of block.activeUsers) {
      if (String(id) !== String(session.user)) others.add(String(id));
    }
  }
  return others.size;
}

/**
 * Everything the shield screen needs in one answer: trust, the block the
 * user is in and its score, their SOS, SOS alerts nearby, and an ended SOS
 * still waiting for "was it real?".
 */
async function getStatus(user, now = new Date(), session = undefined) {
  const current = session === undefined ? await SafetySession.findOne({ user: user._id }).lean() : session;

  const pendingOutcome = await SosAlert.findOne({
    user: user._id,
    status: { $in: ['ended', 'expired'] },
    outcome: null,
    endedAt: { $gte: new Date(now - OUTCOME_WINDOW_MS) },
  })
    .sort({ endedAt: -1 })
    .select('_id startedAt endedAt')
    .lean();

  const trustNow = trust.readTrust(await User.findById(user._id).select('safety').lean());
  const base = {
    trust: { ...trustNow, isVerified: !!user.isAadhaarVerified },
    pendingOutcome: pendingOutcome
      ? { id: pendingOutcome._id, startedAt: pendingOutcome.startedAt, endedAt: pendingOutcome.endedAt }
      : null,
  };
  if (!current) return { ...base, session: null, block: null, sos: null, nearby: [] };

  const [block, alert, nearby, companions] = await Promise.all([
    SafetyBlock.findOne({ geohash: current.geohash8 }).lean(),
    current.activeAlert
      ? SosAlert.findOne({ _id: current.activeAlert, status: 'active' }).select('startedAt trigger').lean()
      : null,
    nearbyAlerts(user._id, current.position, now),
    companionsNearby(current),
  ]);

  return {
    ...base,
    session: {
      startedAt: current.startedAt,
      mode: current.mode,
      position: { lat: current.position.lat, lng: current.position.lng },
      blocksWatched: current.blocks.length,
      companionsNearby: companions,
    },
    block: toBlock(block, current.geohash8, now),
    sos: alert ? { id: alert._id, startedAt: alert.startedAt, trigger: alert.trigger } : null,
    nearby,
  };
}

// ── Dispatcher sweeps ───────────────────────────────────────────────────────

/** Closes shields that stopped reporting (phone off, app killed) without credit. */
async function closeQuietSessions(now = new Date()) {
  const quiet = await SafetySession.find({ lastSeenAt: { $lt: new Date(now - SESSION_QUIET_MS) } }).limit(200);
  for (const session of quiet) {
    const removed = await SafetySession.findOneAndDelete({ _id: session._id, lastSeenAt: session.lastSeenAt });
    if (removed) await leaveBlocks(removed.user, removed.blocks);
  }
  return quiet.length;
}

/** Expires SOS alerts nobody has updated for two hours. */
async function expireQuietAlerts(now = new Date()) {
  const quiet = await SosAlert.find({ status: 'active', lastSeenAt: { $lt: new Date(now - ALERT_QUIET_MS) } })
    .select('_id')
    .limit(200)
    .lean();
  if (quiet.length === 0) return 0;
  const ids = quiet.map((a) => a._id);
  await SosAlert.updateMany({ _id: { $in: ids }, status: 'active' }, { $set: { status: 'expired', endedAt: now } });
  await SafetySession.updateMany({ activeAlert: { $in: ids } }, { $set: { activeAlert: null } });
  return ids.length;
}

module.exports = {
  ALERT_QUIET_MS,
  MIN_SAFE_WALK_MS,
  NEARBY_RADIUS_M,
  SESSION_QUIET_MS,
  closeQuietSessions,
  endSession,
  expireQuietAlerts,
  getStatus,
  nearbyAlerts,
  readPoint,
  recordOutcome,
  startSos,
  stopSos,
  touchSession,
  updateLocation,
};
