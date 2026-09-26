/**
 * Profile helpers shared by the auth routes: one place that decides what a
 * user looks like to the app, and what the app is allowed to change.
 */

const LANGUAGES = ['en', 'hi', 'mr', 'bn', 'ta', 'te'];

// Filled in by DigiLocker once verified; editable by hand only before that.
const IDENTITY_FIELDS = ['name', 'dob', 'gender', 'address'];
const CONTACT_FIELDS = ['phone', 'city', 'pincode', 'preferredLanguage'];

/** Shape returned to the app for the signed-in user. */
function toProfile(user) {
  return {
    id: user._id,
    googleEmail: user.googleEmail,
    googleAvatar: user.googleAvatar,
    name: user.name,
    dob: user.dob,
    gender: user.gender,
    address: user.address,
    aadhaarNumber: user.aadhaarNumber,
    phone: user.phone,
    city: user.city,
    pincode: user.pincode,
    preferredLanguage: user.preferredLanguage,
    detailsSource: user.detailsSource,
    isAadhaarVerified: user.isAadhaarVerified,
    aadhaarVerifiedAt: user.aadhaarVerifiedAt,
    isWorker: user.isWorker,
    workerPromptDismissed: user.workerPromptDismissed,
    worker: {
      incomeBracket: user.worker?.incomeBracket ?? null,
      categories: user.worker?.categories ?? [],
      registeredAt: user.worker?.registeredAt ?? null,
      deregisteredAt: user.worker?.deregisteredAt ?? null,
      onboardedVia: user.worker?.onboardedVia ?? null,
    },
    location:
      user.location?.coordinates?.length === 2
        ? { lat: user.location.coordinates[1], lng: user.location.coordinates[0] }
        : null,
    locationUpdatedAt: user.locationUpdatedAt,
    createdAt: user.createdAt,
  };
}

function isValidDob(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return false;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  const isRealDate =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return isRealDate && y >= 1900 && date < new Date();
}

// Each validator gets a trimmed, non-empty string and returns the value to
// store, or throws a message for the user.
const validators = {
  name(v) {
    if (!/^[\p{L}\p{M} .'-]{2,80}$/u.test(v)) throw 'Enter your full name (letters only).';
    return v.replace(/\s+/g, ' ');
  },
  dob(v) {
    if (!isValidDob(v)) throw 'Enter a valid date as DD/MM/YYYY.';
    return v;
  },
  gender(v) {
    if (!['M', 'F', 'T'].includes(v)) throw 'Choose a gender.';
    return v;
  },
  address(v) {
    if (v.length < 5 || v.length > 300) throw 'Enter your full address.';
    return v;
  },
  phone(v) {
    const digits = v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) throw 'Enter a valid 10-digit mobile number.';
    return digits;
  },
  city(v) {
    if (v.length < 2 || v.length > 60) throw 'Enter your city.';
    return v;
  },
  pincode(v) {
    if (!/^[1-9]\d{5}$/.test(v)) throw 'Enter a valid 6-digit PIN code.';
    return v;
  },
  preferredLanguage(v) {
    if (!LANGUAGES.includes(v)) throw 'Choose a supported language.';
    return v;
  },
};

// A real number, or a numeric string — never '', null, true or [18],
// which Number() would quietly turn into coordinates.
function toCoordinate(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return NaN;
}

// { lat, lng } from the app → GeoJSON Point, or null to clear.
function parseLocation(raw) {
  if (raw === null) return null;
  const lat = toCoordinate(raw?.lat);
  const lng = toCoordinate(raw?.lng);
  const ok =
    raw &&
    typeof raw === 'object' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!ok) throw 'Could not read your location. Please try again.';
  return { type: 'Point', coordinates: [lng, lat] };
}

/** Normalised name, or throws a message for the user. */
function validateName(v) {
  return validators.name(String(v).trim());
}

/**
 * Validates a PATCH body against the user's current state.
 * Returns { updates, errors } — errors is keyed by field name.
 * Empty strings / null clear a field.
 */
function validateProfileUpdate(user, body) {
  const editable = user.isAadhaarVerified
    ? CONTACT_FIELDS
    : [...IDENTITY_FIELDS, ...CONTACT_FIELDS];

  const updates = {};
  const errors = {};

  if (body && 'location' in body) {
    try {
      updates.location = parseLocation(body.location);
      updates.locationUpdatedAt = updates.location ? new Date() : null;
    } catch (message) {
      errors.location = message;
    }
  }

  for (const [field, raw] of Object.entries(body || {})) {
    if (!validators[field]) continue; // ignore unknown keys
    if (!editable.includes(field)) {
      errors[field] = 'Verified from Aadhaar — this can’t be changed.';
      continue;
    }
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      updates[field] = field === 'preferredLanguage' ? 'en' : null;
      continue;
    }
    try {
      updates[field] = validators[field](String(raw).trim());
    } catch (message) {
      errors[field] = message;
    }
  }

  return { updates, errors };
}

module.exports = {
  IDENTITY_FIELDS,
  LANGUAGES,
  toProfile,
  validateName,
  validateProfileUpdate,
};
