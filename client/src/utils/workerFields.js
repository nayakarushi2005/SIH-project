export const WORKER_MESSAGES = {
  name: 'Enter the full name (letters only).',
  phone: 'Enter a valid 10-digit mobile number.',
  aadhaar: 'Enter a valid 12-digit Aadhaar number.',
  photo: 'Add a photo of the worker.',
  photoLink: 'Photo must be a link starting with http:// or https://.',
  duplicate: 'A worker with this mobile number is already in your federation.',
  duplicateInSheet: 'This mobile number appears more than once in the sheet.',
};

const NAME_PATTERN = /^[\p{L}\p{M} .'-]{2,80}$/u;
const PHOTO_LINK_MAX_LENGTH = 500;

const VERHOEFF_MULTIPLY = [
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

const VERHOEFF_PERMUTE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const asText = (value) => (value === null || value === undefined ? '' : String(value));

export function passesVerhoeff(digits) {
  let check = 0;
  const reversed = String(digits).split('').reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    check = VERHOEFF_MULTIPLY[check][VERHOEFF_PERMUTE[i % 8][Number(reversed[i])]];
  }
  return check === 0;
}

export function normalizeName(value) {
  const name = asText(value).trim().replace(/\s+/g, ' ');
  return NAME_PATTERN.test(name) ? name : null;
}

export function normalizePhone(value) {
  let digits = asText(value).replace(/[\s().-]/g, '');
  if (/^\+?91\d{10}$/.test(digits)) {
    digits = digits.slice(-10);
  } else if (/^0\d{10}$/.test(digits)) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function normalizeAadhaar(value) {
  const digits = asText(value).replace(/[\s-]/g, '');
  return /^[2-9]\d{11}$/.test(digits) && passesVerhoeff(digits) ? digits : null;
}

function isWebLink(link) {
  if (link.length > PHOTO_LINK_MAX_LENGTH) return false;
  try {
    const { protocol } = new URL(link);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizePhotoLink(value) {
  const link = asText(value).trim();
  if (!link) return { photoUrl: null };
  return isWebLink(link) ? { photoUrl: link } : { error: WORKER_MESSAGES.photoLink };
}

export function checkWorkerFields({ name, phone, aadhaar }) {
  const values = {
    name: normalizeName(name),
    phone: normalizePhone(phone),
    aadhaar: normalizeAadhaar(aadhaar),
  };
  const errors = {};
  for (const field of ['name', 'phone', 'aadhaar']) {
    if (!values[field]) errors[field] = WORKER_MESSAGES[field];
  }
  return { values, errors };
}

export function checkImportRow(row) {
  const { values, errors } = checkWorkerFields(row);
  const photo = normalizePhotoLink(row.photoUrl);
  if (photo.error) errors.photoUrl = photo.error;
  return { values: { ...values, photoUrl: photo.photoUrl ?? null }, errors };
}

export function maskAadhaar(value) {
  const digits = asText(value).replace(/\D/g, '');
  return digits.length >= 4 ? `XXXX-XXXX-${digits.slice(-4)}` : null;
}

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

export function avatarUrl(url) {
  if (!url) return null;
  const match = CLOUDINARY_UPLOAD.exec(url);
  return match ? `${match[1]}c_fill,g_face,w_80,h_80,q_auto,f_auto/${match[2]}` : url;
}
