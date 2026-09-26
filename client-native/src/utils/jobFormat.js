export function formatMinutes(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatJobDate(dateKey, options = { day: 'numeric', month: 'short' }) {
  if (!dateKey) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', options);
}

export function formatJobSlot(job) {
  const start = formatMinutes(job.startTime);
  const end = formatMinutes(job.endTime);
  if (start && end) return `${start} to ${end}`;
  return start ? `From ${start}` : null;
}

export function formatPrice(price) {
  return price != null ? `₹${Number(price).toLocaleString('en-IN')}` : null;
}

export function formatPostedAt(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
}

export const JOB_STATUS_LABELS = {
  posted: 'Open',
  accepted: 'Worker assigned',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
