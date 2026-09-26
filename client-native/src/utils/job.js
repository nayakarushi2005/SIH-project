// Display helpers for jobs, shared by the job form and the bookings list.

import i18n from '../i18n';
import { localeTag } from '../i18n/language';

export const MAX_PHOTOS = 5;

// Duration presets offered when posting a job, in minutes.
export const DURATIONS = [
  { value: 30, key: 'durations.m30' },
  { value: 60, key: 'durations.h1' },
  { value: 120, key: 'durations.h2' },
  { value: 240, key: 'durations.halfDay' },
  { value: 480, key: 'durations.fullDay' },
  { value: 1440 * 2, key: 'durations.d2' },
];

/** DURATIONS as { value, label } options for OptionGroup, translated. */
export function durationOptions(t) {
  return DURATIONS.map((d) => ({ value: d.value, label: t(d.key) }));
}

const STATUS = {
  SEARCHING: { tone: 'warning' },
  ASSIGNED: { tone: 'primary' },
  IN_PROGRESS: { tone: 'primary' },
  COMPLETED: { tone: 'muted' },
  CANCELLED: { tone: 'muted' },
  EXPIRED: { tone: 'danger' },
};

/** { key, tone } — translate `key` with t(), e.g. t(jobStatus(job.status).key). */
export function jobStatus(status) {
  const s = STATUS[status];
  return s ? { key: `jobStatus.${status}`, tone: s.tone } : { key: null, label: status, tone: 'muted' };
}

export function formatDuration(mins) {
  const preset = DURATIONS.find((d) => d.value === mins);
  if (preset) return i18n.t(preset.key);
  if (mins < 60) return i18n.t('durations.minutes', { n: mins });
  if (mins < 1440) return i18n.t('durations.hours', { n: Math.round(mins / 60) });
  return i18n.t('durations.days', { n: Math.round(mins / 1440) });
}

export function formatDistance(meters) {
  if (meters == null) return null;
  return meters < 1000
    ? i18n.t('distance.m', { n: Math.round(meters / 10) * 10 })
    : i18n.t('distance.km', { n: (meters / 1000).toFixed(1) });
}

/** "19:32" for a time left in milliseconds. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export function formatPrice(rupees) {
  return `₹${Number(rupees).toLocaleString(localeTag())}`;
}

/** Small square Cloudinary thumbnail for a job photo URL. */
export function thumbnailUrl(url, size = 160) {
  return url.replace('/image/upload/', `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}
