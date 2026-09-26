// Display helpers for jobs, shared by the job form and the bookings list.

export const MAX_PHOTOS = 5;

// Duration presets offered when posting a job, in minutes.
export const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
  { value: 120, label: '2 hrs' },
  { value: 240, label: 'Half day' },
  { value: 480, label: 'Full day' },
  { value: 1440 * 2, label: '2 days' },
];

const STATUS = {
  SEARCHING: { label: 'Finding a worker', tone: 'warning' },
  ASSIGNED: { label: 'Worker assigned', tone: 'primary' },
  IN_PROGRESS: { label: 'In progress', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'muted' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  EXPIRED: { label: 'No worker found', tone: 'danger' },
};

export function jobStatus(status) {
  return STATUS[status] ?? { label: status, tone: 'muted' };
}

export function formatDuration(mins) {
  const preset = DURATIONS.find((d) => d.value === mins);
  if (preset) return preset.label;
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} hrs`;
  return `${Math.round(mins / 1440)} days`;
}

export function formatDistance(meters) {
  if (meters == null) return null;
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** "19:32" for a time left in milliseconds. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export function formatPrice(rupees) {
  return `₹${Number(rupees).toLocaleString('en-IN')}`;
}

/** Small square Cloudinary thumbnail for a job photo URL. */
export function thumbnailUrl(url, size = 160) {
  return url.replace('/image/upload/', `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}
