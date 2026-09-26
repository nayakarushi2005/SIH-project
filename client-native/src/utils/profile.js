// Display helpers and option lists for the user profile. Keep the value lists
// in sync with backend/services/profile.js.

export const GENDERS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'T', label: 'Transgender' },
];

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'mr', label: 'मराठी' },
  { value: 'bn', label: 'বাংলা' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'te', label: 'తెలుగు' },
];

// What we need before a user can post a job.
export const REQUIRED_FIELDS = ['name', 'phone', 'address', 'city', 'pincode'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Format DOB nicely if it's DD/MM/YYYY (or DD-MM-YYYY); otherwise show as-is.
export function formatDOB(dob) {
  if (!dob) return null;
  const parts = String(dob).split(/[/-]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = MONTHS[parseInt(parts[1], 10) - 1];
    if (day && month) return `${day} ${month} ${parts[2]}`;
  }
  return String(dob);
}

export function genderLabel(g) {
  if (!g) return null;
  return GENDERS.find((o) => o.value === g.toUpperCase())?.label || g;
}

export function languageLabel(code) {
  return LANGUAGES.find((o) => o.value === code)?.label || null;
}

export function formatPhone(phone) {
  if (!phone) return null;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export function initialsOf(user) {
  if (user?.name) {
    return user.name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return user?.googleEmail?.[0]?.toUpperCase() || '?';
}

export function profileCompletion(user) {
  const done = REQUIRED_FIELDS.filter((f) => user?.[f]).length;
  return { done, total: REQUIRED_FIELDS.length };
}

// Typing helper: turns "15081999" into "15/08/1999" as the user types.
export function maskDOB(input) {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
