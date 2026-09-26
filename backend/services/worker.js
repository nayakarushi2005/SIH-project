/**
 * Worker profile helpers shared by the worker routes: what a worker may set
 * about themselves, and what their profile looks like to the app.
 */

const { CATEGORIES } = require('./job');

const MAX_SKILLS = 5;
const DEFAULT_RADIUS_KM = 5;

// The app sends a location heartbeat about once a minute while online; a
// worker silent for longer than this is treated as offline (app killed,
// phone died) even if they never tapped "Go offline".
const PRESENCE_TTL_MS = 3 * 60 * 1000;

function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/** Shape returned to the app for the signed-in worker. */
function toWorkerProfile(profile) {
  const coords = profile.location?.coordinates;
  return {
    skills: profile.skills,
    bio: profile.bio,
    experienceYears: profile.experienceYears,
    serviceRadiusKm: profile.serviceRadiusKm,
    isOnline: isPresent(profile),
    location: coords ? { lat: coords[1], lng: coords[0] } : null,
    currentJob: profile.currentJob,
    createdAt: profile.createdAt,
  };
}

/** Online and heard from recently — the only workers matching considers. */
function isPresent(profile, now = Date.now()) {
  return (
    profile.isOnline &&
    !!profile.lastSeenAt &&
    now - profile.lastSeenAt.getTime() <= PRESENCE_TTL_MS
  );
}

// Each validator gets the raw body value and returns the value to store, or
// throws a message for the user. Optional fields clear when sent empty.
const validators = {
  skills(v) {
    if (!Array.isArray(v) || v.length === 0) throw 'Choose at least one service you offer.';
    const skills = [...new Set(v)];
    if (skills.length > MAX_SKILLS) throw `Choose at most ${MAX_SKILLS} services.`;
    if (!skills.every((s) => CATEGORIES.includes(s))) throw 'Choose services from the list.';
    return skills;
  },
  bio(v) {
    if (isEmpty(v)) return null;
    const text = String(v).trim().replace(/\s+/g, ' ');
    if (text.length > 300) throw 'Keep your introduction under 300 characters.';
    return text;
  },
  experienceYears(v) {
    if (isEmpty(v)) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 60) throw 'Enter your experience in whole years.';
    return n;
  },
  serviceRadiusKm(v) {
    if (isEmpty(v)) return DEFAULT_RADIUS_KM;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 25) throw 'Choose a distance between 1 and 25 km.';
    return n;
  },
};

/**
 * Validates the worker profile form (the full set of editable fields).
 * Returns { fields, errors } — errors is keyed by field name.
 */
function validateWorkerProfile(body) {
  const fields = {};
  const errors = {};

  for (const [field, validate] of Object.entries(validators)) {
    try {
      fields[field] = validate(body?.[field]);
    } catch (message) {
      errors[field] = message;
    }
  }

  return { fields, errors };
}

module.exports = {
  PRESENCE_TTL_MS,
  isPresent,
  toWorkerProfile,
  validateWorkerProfile,
};
