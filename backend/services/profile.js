const LANGUAGES = ['en', 'hi', 'mr', 'bn', 'ta', 'te'];

const IDENTITY_FIELDS = ['name', 'dob', 'gender', 'address'];
const CONTACT_FIELDS = ['phone', 'city', 'pincode', 'preferredLanguage'];

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

function validateProfileUpdate(user, body) {
  const editable = user.isAadhaarVerified
    ? CONTACT_FIELDS
    : [...IDENTITY_FIELDS, ...CONTACT_FIELDS];

  const updates = {};
  const errors = {};

  for (const [field, raw] of Object.entries(body || {})) {
    if (!validators[field]) continue;
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
  validateProfileUpdate,
};
