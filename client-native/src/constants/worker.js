// Keep in sync with backend/services/worker.js.
export const INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l'];
export const MAX_CATEGORIES = 10;

// Why a worker cancels an accepted job. Mirrored in backend/services/job.js
// (WITHDRAW_REASONS); 'other' needs a short note.
export const WITHDRAW_REASONS = [
  'too_far',
  'price_too_low',
  'emergency',
  'vehicle_issue',
  'client_unreachable',
  'job_details_wrong',
  'other',
];
