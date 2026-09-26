/**
 * Job helpers shared by the job routes: what a client is allowed to post,
 * and what a job looks like to the app.
 */

const { isOwnedJobPhoto } = require('./cloudinary');

// Mirrors SERVICES in client-native/src/constants/services.js.
const CATEGORIES = [
  'electrician',
  'cleaning',
  'plumber',
  'carpenter',
  'painter',
  'caregiver',
  'driver',
  'gardener',
  'technician',
];

const MAX_PHOTOS = 5;

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
  if (!valid) throw 'We couldn’t read your location. Please allow location access.';
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
    if (!CATEGORIES.includes(v)) throw 'Choose a service.';
    return v;
  },
  description(v) {
    const text = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (text.length < 10 || text.length > 500) {
      throw 'Describe the work in 10–500 characters.';
    }
    return text;
  },
  photos(v, user) {
    if (!Array.isArray(v) || v.length === 0) throw 'Add at least one photo of the work.';
    if (v.length > MAX_PHOTOS) throw `Add at most ${MAX_PHOTOS} photos.`;
    if (!v.every((url) => isOwnedJobPhoto(url, user._id))) {
      throw 'A photo didn’t upload correctly. Please remove it and add it again.';
    }
    return [...new Set(v)];
  },
  price(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 50 || n > 100000) {
      throw 'Enter a price between ₹50 and ₹1,00,000.';
    }
    return n;
  },
  expectedDurationMins(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 15 || n > 7 * 24 * 60) {
      throw 'Enter a duration between 15 minutes and 7 days.';
    }
    return n;
  },
  location(v) {
    return toGeoPoint(v);
  },
  address(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const text = String(v).trim();
    if (text.length < 5 || text.length > 300) throw 'Enter the address in 5–300 characters.';
    return text;
  },
};

/**
 * Validates a new job posted by `user`.
 * Returns { job, errors } — errors is keyed by field name; job is only
 * complete when errors is empty.
 */
function validateNewJob(user, body) {
  const job = {};
  const errors = {};

  for (const [field, validate] of Object.entries(validators)) {
    try {
      job[field] = validate(body?.[field], user);
    } catch (message) {
      errors[field] = message;
    }
  }

  return { job, errors };
}

module.exports = {
  CATEGORIES,
  toGeoPoint,
  toJob,
  toOffer,
  validateNewJob,
};
