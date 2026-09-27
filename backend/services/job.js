/**
 * Job helpers shared by the job routes: what a client is allowed to post,
 * and what a job looks like to the app.
 */

const Category = require('../models/Category');
const User = require('../models/User');
const WorkerProfile = require('../models/WorkerProfile');
const WorkerStats = require('../models/WorkerStats');
const { isOwnedJobPhoto } = require('./cloudinary');
const { fieldError } = require('./errors');
const { LANGUAGES } = require('./profile');

const MAX_PHOTOS = 5;

// After accepting, a worker can back out (with a reason) for this long, like
// a ride captain. Later, only a start-code lockout lets them withdraw.
const WORKER_CANCEL_WINDOW_MS = 5 * 60 * 1000;

// Why a worker withdraws — shown as a list in the app; 'other' needs a note.
const WITHDRAW_REASONS = [
  'too_far',
  'price_too_low',
  'emergency',
  'vehicle_issue',
  'client_unreachable',
  'job_details_wrong',
  'other',
];
const MAX_WITHDRAW_NOTE = 200;

// Statuses in which the client sees the assigned worker's (masked) phone.
const CONTACT_STATUSES = ['ASSIGNED', 'IN_PROGRESS'];

/** "9876543210" → "98XXXXXX10". The full number never leaves the server. */
function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6) return null;
  return `${digits.slice(0, 2)}${'X'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

/** The slugs among `slugs` that are active job categories (models/Category.js). */
async function activeCategorySlugs(slugs) {
  const found = await Category.find({ slug: { $in: slugs }, isActive: true }).select('slug').lean();
  return new Set(found.map((c) => c.slug));
}

/**
 * Turns an app-sent { lat, lng } into a GeoJSON point ([lng, lat] order), or
 * throws a message for the user.
 */
function toGeoPoint(v) {
  const { lat, lng } = v || {};
  const valid =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!valid) {
    throw fieldError(
      'job_location_invalid',
      'We couldn’t read your location. Please allow location access.'
    );
  }
  return { type: 'Point', coordinates: [lng, lat] };
}

/**
 * What a client sees about the workers assigned to `jobs`: a Map from worker
 * id to { name, photo, phoneMasked, aadhaarVerified, rating, completedJobs,
 * experienceYears }. Pass it to toJob as `workers`.
 */
async function assignedWorkerCards(jobs) {
  const ids = [...new Set(jobs.filter((j) => j.assignedWorker).map((j) => String(j.assignedWorker)))];
  if (ids.length === 0) return new Map();

  const [users, profiles, stats] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name googleAvatar phone isAadhaarVerified').lean(),
    WorkerProfile.find({ user: { $in: ids } }).select('user experienceYears').lean(),
    WorkerStats.find({ worker: { $in: ids } }).select('worker ratingSum ratingCount completedTotal').lean(),
  ]);
  const profileOf = new Map(profiles.map((p) => [String(p.user), p]));
  const statsOf = new Map(stats.map((s) => [String(s.worker), s]));

  return new Map(
    users.map((u) => {
      const s = statsOf.get(String(u._id)) ?? {};
      const ratingCount = s.ratingCount ?? 0;
      return [
        String(u._id),
        {
          id: u._id,
          name: u.name,
          photo: u.googleAvatar,
          phoneMasked: maskPhone(u.phone),
          aadhaarVerified: !!u.isAadhaarVerified,
          rating: {
            average: ratingCount ? Math.round((s.ratingSum / ratingCount) * 10) / 10 : null,
            count: ratingCount,
          },
          completedJobs: s.completedTotal ?? 0,
          experienceYears: profileOf.get(String(u._id))?.experienceYears ?? null,
        },
      ];
    })
  );
}

/** Until when the assigned worker may still withdraw, or null outside the window. */
function cancelDeadline(job) {
  if (job.status !== 'ASSIGNED' || !job.assignedAt) return null;
  return new Date(job.assignedAt.getTime() + WORKER_CANCEL_WINDOW_MS);
}

/**
 * Shape returned to the app for a job, as seen by `viewerId` (the client or
 * the assigned worker). Only the client ever sees the start code, and the
 * assigned worker's details (from assignedWorkerCards) — their masked phone
 * only while the job is under way.
 */
function toJob(job, viewerId, { workers } = {}) {
  const [lng, lat] = job.location.coordinates;
  const isClient = String(job.client) === String(viewerId);
  const card = isClient && job.assignedWorker ? workers?.get(String(job.assignedWorker)) : null;
  return {
    id: job._id,
    category: job.category,
    description: job.description,
    photos: job.photos,
    price: job.price,
    expectedDurationMins: job.expectedDurationMins,
    location: { lat, lng },
    address: job.address,
    language: job.language,
    postedVia: job.postedVia,
    clientAadhaarVerified: job.clientAadhaarVerified,
    status: job.status,
    assignedWorker: job.assignedWorker,
    worker: card
      ? { ...card, phoneMasked: CONTACT_STATUSES.includes(job.status) ? card.phoneMasked : null }
      : null,
    startCode: isClient && job.status === 'ASSIGNED' ? job.startCode : null,
    // While SEARCHING: when the search gives up (the job then EXPIRES).
    searchDeadline: job.status === 'SEARCHING' ? (job.dispatch?.searchDeadline ?? null) : null,
    // Only the assigned worker: until when they may still withdraw.
    cancelDeadline: isClient ? null : cancelDeadline(job),
    createdAt: job.createdAt,
    assignedAt: job.assignedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    expiredAt: job.expiredAt,
    feedbackGiven: !!job.feedbackAt,
  };
}

/**
 * Shape of an open offer shown to `workerId`. Leaves out the exact location
 * and address — the worker sees how far away the job is, and gets the
 * address only once they accept.
 */
function toOffer(job, workerId) {
  // A worker can hold offers from several searches; the newest is the open one.
  const offer = job.dispatch.offers.findLast((o) => String(o.worker) === String(workerId));
  return {
    jobId: job._id,
    category: job.category,
    description: job.description,
    photos: job.photos,
    price: job.price,
    expectedDurationMins: job.expectedDurationMins,
    language: job.language,
    clientAadhaarVerified: job.clientAadhaarVerified,
    distanceMeters: offer?.distanceMeters ?? null,
    expiresAt: offer?.expiresAt ?? null,
    postedAt: job.createdAt,
  };
}

// Each validator gets the raw body value and returns the value to store, or
// throws a message for the user.
const validators = {
  category(v) {
    // Shape only here; validateNewJob checks it's an active category.
    if (typeof v !== 'string' || v.trim() === '') {
      throw fieldError('job_category_required', 'Choose a service.');
    }
    return v.trim();
  },
  description(v) {
    const text = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (text.length < 10 || text.length > 500) {
      throw fieldError('job_description_length', 'Describe the work in 10–500 characters.');
    }
    return text;
  },
  photos(v, user) {
    if (!Array.isArray(v) || v.length === 0) {
      throw fieldError('job_photos_required', 'Add at least one photo of the work.');
    }
    if (v.length > MAX_PHOTOS) {
      throw fieldError('job_photos_max', `Add at most ${MAX_PHOTOS} photos.`, { max: MAX_PHOTOS });
    }
    if (!v.every((url) => isOwnedJobPhoto(url, user._id))) {
      throw fieldError(
        'job_photos_invalid',
        'A photo didn’t upload correctly. Please remove it and add it again.'
      );
    }
    return [...new Set(v)];
  },
  price(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 50 || n > 100000) {
      throw fieldError('job_price_range', 'Enter a price between ₹50 and ₹1,00,000.');
    }
    return n;
  },
  expectedDurationMins(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 15 || n > 7 * 24 * 60) {
      throw fieldError('job_duration_range', 'Enter a duration between 15 minutes and 7 days.');
    }
    return n;
  },
  location(v) {
    return toGeoPoint(v);
  },
  address(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const text = String(v).trim();
    if (text.length < 5 || text.length > 300) {
      throw fieldError('job_address_length', 'Enter the address in 5–300 characters.');
    }
    return text;
  },
  language(v) {
    if (v == null || v === '') return 'en';
    if (LANGUAGES.includes(v)) return v;
    throw fieldError('job_language_invalid', 'Unsupported language.');
  },
  postedVia(v) {
    return v === 'voice' ? 'voice' : 'form';
  },
};

/**
 * Validates a new job posted by `user`.
 * Returns { job, errors } — errors is keyed by field name; job is only
 * complete when errors is empty.
 */
async function validateNewJob(user, body) {
  const job = {};
  const errors = {};

  for (const [field, validate] of Object.entries(validators)) {
    try {
      job[field] = validate(body?.[field], user);
    } catch (message) {
      errors[field] = message;
    }
  }

  if (!errors.category && !(await activeCategorySlugs([job.category])).has(job.category)) {
    errors.category = fieldError('job_category_required', 'Choose a service.');
  }

  return { job, errors };
}

// What a client may change when retrying an expired job.
const EDITABLE_FIELDS = ['category', 'description', 'price', 'expectedDurationMins', 'address'];

/**
 * Validates changes to an expired job before it's searched again. Only the
 * fields present in `body` are checked and returned.
 * Returns { fields, errors } — errors is keyed by field name.
 */
async function validateJobEdits(user, body) {
  const fields = {};
  const errors = {};

  for (const field of EDITABLE_FIELDS) {
    if (body?.[field] === undefined) continue;
    try {
      fields[field] = validators[field](body[field], user);
    } catch (message) {
      errors[field] = message;
    }
  }

  if (fields.category && !(await activeCategorySlugs([fields.category])).has(fields.category)) {
    errors.category = fieldError('job_category_required', 'Choose a service.');
  }

  return { fields, errors };
}

/**
 * Validates a worker's reason for withdrawing: { reason, note }.
 * Returns { fields: { reason, note }, errors } — errors is keyed by field name.
 */
function validateWithdrawal(body) {
  const errors = {};
  const reason = body?.reason;
  const note = typeof body?.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';

  if (!WITHDRAW_REASONS.includes(reason)) {
    errors.reason = fieldError('job_withdraw_reason_required', 'Choose why you’re cancelling.');
  } else if (reason === 'other' && note.length < 3) {
    errors.note = fieldError('job_withdraw_note_required', 'Tell us briefly why you’re cancelling.');
  }
  if (note.length > MAX_WITHDRAW_NOTE) {
    errors.note = fieldError('job_withdraw_note_length', `Keep it under ${MAX_WITHDRAW_NOTE} characters.`, {
      max: MAX_WITHDRAW_NOTE,
    });
  }
  return { fields: { reason, note: note || null }, errors };
}

module.exports = {
  WITHDRAW_REASONS,
  WORKER_CANCEL_WINDOW_MS,
  activeCategorySlugs,
  assignedWorkerCards,
  toGeoPoint,
  toJob,
  toOffer,
  validateJobEdits,
  validateNewJob,
  validateWithdrawal,
};
