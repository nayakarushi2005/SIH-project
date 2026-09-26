/**
 * Job helpers shared by the job routes: what a client is allowed to post,
 * and what a job looks like to the app.
 */

const Category = require('../models/Category');
const { isOwnedJobPhoto } = require('./cloudinary');
const { fieldError } = require('./errors');
const { LANGUAGES } = require('./profile');

const MAX_PHOTOS = 5;

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
 * Shape returned to the app for a job, as seen by `viewerId` (the client or
 * the assigned worker). Only the client ever sees the start code.
 */
function toJob(job, viewerId) {
  const [lng, lat] = job.location.coordinates;
  const isClient = String(job.client) === String(viewerId);
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
    startCode: isClient && job.status === 'ASSIGNED' ? job.startCode : null,
    createdAt: job.createdAt,
    assignedAt: job.assignedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    feedbackGiven: !!job.feedbackAt,
  };
}

/**
 * Shape of an open offer shown to `workerId`. Leaves out the exact location
 * and address — the worker sees how far away the job is, and gets the
 * address only once they accept.
 */
function toOffer(job, workerId) {
  const offer = job.dispatch.offers.find((o) => String(o.worker) === String(workerId));
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

module.exports = {
  activeCategorySlugs,
  toGeoPoint,
  toJob,
  toOffer,
  validateNewJob,
};
