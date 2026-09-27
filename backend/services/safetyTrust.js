/**
 * Trust score and block safety math for the safety shield. Pure functions;
 * the server is the only place these run, so a phone can't set its own trust.
 *
 * Trust (1–10, new users 5): how much a user's SOS counts.
 *   false alarm     → trust × e^(−0.4), floor 1, streak reset, false count +1
 *   real emergency  → +1, cap 10
 *   safe walk       → streak +1; every 5th gives +0.5 (cap 7.5, or 10 if
 *                     Aadhaar-verified) and resets the streak
 *
 * Block score (1–10, 10 = no reports): each SOS adds the user's trust,
 * weighted by time of day, to the block's impact; impact fades with a
 * ~70 h half-life; score = max(1, 10 · e^(−0.05 · impact)).
 */

const TRUST_DEFAULT = 5.0;
const TRUST_MIN = 1.0;
const TRUST_MAX_NORMAL = 7.5;
const TRUST_MAX_VERIFIED = 10.0;
const SAFE_WALK_STREAK_THRESHOLD = 5;
const SAFE_WALK_BONUS = 0.5;
const FALSE_ALARM_DECAY = 0.4;
const REAL_EMERGENCY_BOOST = 1.0;

const BLOCK_IMPACT_SCALE = 0.05;
const IMPACT_DECAY_PER_HOUR = 0.01;
const MS_PER_HOUR = 60 * 60 * 1000;

// Night-time reports weigh more. Hours are local time where the app is used,
// not the server's clock.
const TIMEZONE = process.env.SAFETY_TIMEZONE || 'Asia/Kolkata';

const round = (n, places) => Number(n.toFixed(places));

function readTrust(user) {
  const safety = user?.safety || {};
  return {
    trustScore: safety.trustScore ?? TRUST_DEFAULT,
    safeWalkStreak: safety.safeWalkStreak ?? 0,
    falseSosCount: safety.falseSosCount ?? 0,
  };
}

function applyFalseAlarm({ trustScore, falseSosCount }) {
  return {
    trustScore: Math.max(TRUST_MIN, round(trustScore * Math.exp(-FALSE_ALARM_DECAY), 2)),
    safeWalkStreak: 0,
    falseSosCount: (falseSosCount || 0) + 1,
  };
}

function applyRealEmergency({ trustScore, safeWalkStreak, falseSosCount }) {
  return {
    trustScore: Math.min(TRUST_MAX_VERIFIED, round(trustScore + REAL_EMERGENCY_BOOST, 2)),
    safeWalkStreak,
    falseSosCount,
  };
}

function applySafeWalk({ trustScore, safeWalkStreak, falseSosCount }, isVerified) {
  const streak = (safeWalkStreak || 0) + 1;
  if (streak < SAFE_WALK_STREAK_THRESHOLD) {
    return { trustScore, safeWalkStreak: streak, falseSosCount, bonus: false };
  }
  const cap = isVerified ? TRUST_MAX_VERIFIED : TRUST_MAX_NORMAL;
  // Never lower a score that's already above the cap (e.g. from real emergencies).
  const next = Math.max(trustScore, Math.min(cap, round(trustScore + SAFE_WALK_BONUS, 2)));
  return { trustScore: next, safeWalkStreak: 0, falseSosCount, bonus: next > trustScore };
}

function localHour(now) {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: TIMEZONE,
  }).format(now);
  return Number(hour);
}

/** 1.5× from 22:00 to 04:59, 0.7× from 08:00 to 18:59, 1× otherwise. */
function timeOfDayMultiplier(now = new Date()) {
  const hour = localHour(now);
  if (hour >= 22 || hour <= 4) return 1.5;
  if (hour >= 8 && hour <= 18) return 0.7;
  return 1.0;
}

/** What one SOS adds to a block's impact. */
function sosWeight(trustScore, now = new Date()) {
  return (trustScore || TRUST_DEFAULT) * timeOfDayMultiplier(now);
}

/** A block's stored impact faded to `now`. */
function decayedImpact(impact, lastSosAt, now = new Date()) {
  if (!impact || !lastSosAt) return impact || 0;
  const hours = Math.max(0, (now - new Date(lastSosAt)) / MS_PER_HOUR);
  return impact * Math.exp(-IMPACT_DECAY_PER_HOUR * hours);
}

/** The block's score now, from its stored impact and last SOS time. */
function blockScore(impact, lastSosAt, now = new Date()) {
  const current = decayedImpact(impact, lastSosAt, now);
  return Math.max(1, round(10 * Math.exp(-BLOCK_IMPACT_SCALE * current), 2));
}

/** A block's impact after one more SOS by a user with `trustScore`. */
function impactAfterSos(impact, lastSosAt, trustScore, now = new Date()) {
  return decayedImpact(impact, lastSosAt, now) + sosWeight(trustScore, now);
}

module.exports = {
  BLOCK_IMPACT_SCALE,
  IMPACT_DECAY_PER_HOUR,
  MS_PER_HOUR,
  SAFE_WALK_STREAK_THRESHOLD,
  TRUST_DEFAULT,
  applyFalseAlarm,
  applyRealEmergency,
  applySafeWalk,
  blockScore,
  decayedImpact,
  impactAfterSos,
  readTrust,
  sosWeight,
  timeOfDayMultiplier,
};
