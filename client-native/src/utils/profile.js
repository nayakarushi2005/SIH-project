// Display helpers and option lists for the user profile. Keep the value lists
// in sync with backend/services/profile.js.
import i18n from '../i18n';
import { localeTag } from '../i18n/language';

export const GENDER_VALUES = ['M', 'F', 'T'];

export function genderOptions() {
  return GENDER_VALUES.map((value) => ({ value, label: i18n.t(`gender.${value}`) }));
}

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

// Format DOB in the app language if it's DD/MM/YYYY (or DD-MM-YYYY);
// otherwise show as-is.
export function formatDOB(dob) {
  if (!dob) return null;
  const [d, m, y] = String(dob).split(/[/-]/).map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  if (!d || !m || !y || date.getMonth() !== m - 1) return String(dob);
  return date.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function genderLabel(g) {
  if (!g) return null;
  const key = g.toUpperCase();
  return GENDER_VALUES.includes(key) ? i18n.t(`gender.${key}`) : g;
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
