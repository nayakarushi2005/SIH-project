import api from './api';

/**
 * Worker: jobs posted nearby for their skills (or `category`), bucketed into
 * ~500 m cells. window: 'today' | '7d' | '30d'.
 * → { cells: [{ lat, lng, jobs, unfilled }], summary: { jobs, unfilled, avgPrice, busiestFromHour }, radiusKm }
 */
export async function getDemandHeatmap({ lat, lng, category, window }) {
  const res = await api.get('/heatmap/demand', { params: { lat, lng, category, window } });
  return res.data;
}

/**
 * Anyone: workers online nearby for `category` (any service if omitted).
 * → { cells: [{ lat, lng, workers }], summary: { workersOnline, typicalWaitMins }, radiusKm }
 */
export async function getAvailabilityHeatmap({ lat, lng, category }) {
  const res = await api.get('/heatmap/availability', { params: { lat, lng, category } });
  return res.data;
}
