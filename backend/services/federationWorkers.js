const FederationMembership = require('../models/FederationMembership');
const FederationWorker = require('../models/FederationWorker');
const User = require('../models/User');
const { MembershipError, loadVerifiedFederation } = require('./membership');
const { isOwnedFederationWorkerPhoto, signFederationWorkerPhotoUpload } = require('./cloudinary');

const MAX_IMPORT_ROWS = 2000;
const MAX_PHOTO_LINK_LENGTH = 500;
const NAME_PATTERN = /^[\p{L}\p{M} .'-]{2,80}$/u;

const MESSAGES = {
  name: 'Enter the full name (letters only).',
  phone: 'Enter a valid 10-digit mobile number.',
  aadhaar: 'Enter a valid 12-digit Aadhaar number.',
  photoRequired: 'Add a photo of the worker.',
  photoLink: 'Photo must be a link starting with http:// or https://.',
  duplicate: 'A worker with this mobile number is already in your federation.',
  duplicateInSheet: 'This mobile number appears more than once in the sheet.',
  emptyImport: 'The sheet has no workers to import.',
  tooManyRows: 'Import up to 2000 workers at a time.',
  unreadableRows: 'Some rows could not be read. Check the sheet and try again.',
  invalidWorker: 'Please fix the highlighted fields.',
  notFound: 'That worker was not found.',
};

const VERHOEFF_MULTIPLICATION = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_PERMUTATION = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function fail(httpStatus, message, code, fields) {
  throw Object.assign(new MembershipError(code, httpStatus, message), { fields });
}

function failDuplicate() {
  fail(409, MESSAGES.duplicate, 'duplicate_worker', { phone: MESSAGES.duplicate });
}

function asText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function passesVerhoeff(digits) {
  let check = 0;
  digits
    .split('')
    .reverse()
    .forEach((digit, i) => {
      check = VERHOEFF_MULTIPLICATION[check][VERHOEFF_PERMUTATION[i % 8][Number(digit)]];
    });
  return check === 0;
}

function normalizeName(value) {
  const name = asText(value).trim().replace(/\s+/g, ' ');
  return NAME_PATTERN.test(name) ? name : null;
}

function normalizePhone(value) {
  let phone = asText(value).replace(/[\s().-]/g, '');
  if (/^\+?91\d{10}$/.test(phone)) phone = phone.replace(/^\+?91/, '');
  else if (/^0\d{10}$/.test(phone)) phone = phone.slice(1);
  return /^[6-9]\d{9}$/.test(phone) ? phone : null;
}

function aadhaarLast4(value) {
  const aadhaar = asText(value).replace(/[\s-]/g, '');
  return /^[2-9]\d{11}$/.test(aadhaar) && passesVerhoeff(aadhaar) ? aadhaar.slice(-4) : null;
}

function isHttpLink(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function readOwnedPhoto(value, federationId) {
  const url = asText(value).trim();
  return isOwnedFederationWorkerPhoto(url, federationId)
    ? { url }
    : { url: null, error: MESSAGES.photoRequired };
}

function readPhotoLink(value) {
  const url = asText(value).trim();
  if (!url) return { url: null };
  if (url.length <= MAX_PHOTO_LINK_LENGTH && isHttpLink(url)) return { url };
  return { url: null, error: MESSAGES.photoLink };
}

function readWorker(input, readPhoto) {
  const worker = {
    name: normalizeName(input.name),
    phone: normalizePhone(input.phone),
    aadhaarLast4: aadhaarLast4(input.aadhaar),
  };
  const photo = readPhoto(input.photoUrl);
  worker.photoUrl = photo.url;

  const errors = {};
  if (!worker.name) errors.name = MESSAGES.name;
  if (!worker.phone) errors.phone = MESSAGES.phone;
  if (!worker.aadhaarLast4) errors.aadhaar = MESSAGES.aadhaar;
  if (photo.error) errors.photoUrl = photo.error;
  return { worker, errors };
}

async function takenPhones(federationId, phones) {
  const [rosterPhones, memberUserIds] = await Promise.all([
    FederationWorker.distinct('phone', {
      federation: federationId,
      status: 'active',
      phone: { $in: phones },
    }),
    FederationMembership.distinct('user', { federation: federationId, status: 'verified' }),
  ]);
  const memberPhones =
    memberUserIds.length > 0
      ? await User.distinct('phone', { _id: { $in: memberUserIds }, phone: { $in: phones } })
      : [];
  return new Set([...rosterPhones, ...memberPhones]);
}

function toWorker(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    phone: doc.phone,
    aadhaar: `XXXX-XXXX-${doc.aadhaarLast4}`,
    photoUrl: doc.photoUrl || null,
    source: doc.source,
    addedAt: doc.createdAt,
  };
}

async function listWorkers(federationId) {
  await loadVerifiedFederation(federationId);
  const workers = await FederationWorker.find({ federation: federationId, status: 'active' })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return workers.map(toWorker);
}

async function addWorker(federationId, input) {
  await loadVerifiedFederation(federationId);
  const { worker, errors } = readWorker(input || {}, (value) => readOwnedPhoto(value, federationId));
  if (Object.keys(errors).length > 0) fail(400, MESSAGES.invalidWorker, 'invalid_worker', errors);

  const taken = await takenPhones(federationId, [worker.phone]);
  if (taken.has(worker.phone)) failDuplicate();

  try {
    const created = await FederationWorker.create({ federation: federationId, ...worker, source: 'manual' });
    return toWorker(created);
  } catch (err) {
    if (err.code === 11000) failDuplicate();
    throw err;
  }
}

function isRowObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function insertImportedWorkers(docs) {
  if (docs.length === 0) return new Set();
  try {
    await FederationWorker.insertMany(docs, { ordered: false });
    return new Set();
  } catch (err) {
    const writeErrors = err.writeErrors || [];
    const isDuplicate = (writeError) => (writeError.code ?? writeError.err?.code) === 11000;
    if (writeErrors.length === 0 || !writeErrors.every(isDuplicate)) throw err;
    return new Set(writeErrors.map((writeError) => writeError.index));
  }
}

async function importWorkers(federationId, rows) {
  await loadVerifiedFederation(federationId);
  if (!Array.isArray(rows) || rows.length === 0) fail(400, MESSAGES.emptyImport);
  if (rows.length > MAX_IMPORT_ROWS) fail(400, MESSAGES.tooManyRows);
  if (!rows.every(isRowObject)) fail(400, MESSAGES.unreadableRows);

  const results = [];
  const candidates = [];
  const seenPhones = new Set();
  rows.forEach((input, index) => {
    const row = Number.isInteger(input.row) && input.row > 0 ? input.row : index + 2;
    const { worker, errors } = readWorker(input, readPhotoLink);
    if (Object.keys(errors).length > 0) {
      results.push({ row, status: 'invalid', errors });
    } else if (seenPhones.has(worker.phone)) {
      results.push({ row, status: 'duplicate', errors: { phone: MESSAGES.duplicateInSheet } });
    } else {
      seenPhones.add(worker.phone);
      candidates.push({ index, worker });
      results.push({ row, status: 'added' });
    }
  });

  const markDuplicate = (index) => {
    results[index] = { row: results[index].row, status: 'duplicate', errors: { phone: MESSAGES.duplicate } };
  };

  const taken = await takenPhones(federationId, [...seenPhones]);
  const toInsert = [];
  for (const candidate of candidates) {
    if (taken.has(candidate.worker.phone)) markDuplicate(candidate.index);
    else toInsert.push(candidate);
  }

  const racedPositions = await insertImportedWorkers(
    toInsert.map(({ worker }) => ({ federation: federationId, ...worker, source: 'import' }))
  );
  toInsert.forEach(({ index }, position) => {
    if (racedPositions.has(position)) markDuplicate(index);
  });

  return { added: results.filter((r) => r.status === 'added').length, results };
}

async function removeWorker(federationId, workerId) {
  await loadVerifiedFederation(federationId);
  if (!/^[0-9a-fA-F]{24}$/.test(String(workerId))) fail(404, MESSAGES.notFound, 'not_found');
  const worker = await FederationWorker.findOneAndUpdate(
    { _id: workerId, federation: federationId, status: 'active' },
    { $set: { status: 'removed', removedAt: new Date() } },
    { new: true }
  ).lean();
  if (!worker) fail(404, MESSAGES.notFound, 'not_found');
  return { id: String(worker._id), status: 'removed' };
}

async function signWorkerPhoto(federationId) {
  await loadVerifiedFederation(federationId);
  try {
    return signFederationWorkerPhotoUpload(federationId);
  } catch (err) {
    fail(500, err.message, 'uploads_unavailable');
  }
}

function sendWorkerError(res, err) {
  if (err instanceof MembershipError) {
    return res.status(err.httpStatus).json({ message: err.message, code: err.code, fields: err.fields });
  }
  console.error('Federation worker error:', err.message);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
}

module.exports = {
  addWorker,
  importWorkers,
  listWorkers,
  removeWorker,
  sendWorkerError,
  signWorkerPhoto,
};
