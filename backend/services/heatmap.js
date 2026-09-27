/**
 * Heatmaps of where work is (jobs), where workers are, and where the two
 * don't meet — for workers, clients and government officials.
 *
 * Privacy: nothing here ever returns a job's or a worker's own coordinates.
 * Points are bucketed into CELL_DEG grid cells (~500 m) and only the cell
 * centres go out; cells holding fewer than HEATMAP_MIN_COUNT items are
 * dropped, so no single client's home or worker's position can be picked out.
 *
 * Env: HEATMAP_MIN_COUNT (default 2)
 */

const Job = require('../models/Job');
const WorkerProfile = require('../models/WorkerProfile');
const { indiaDay } = require('./matching');
const { PRESENCE_TTL_MS } = require('./workerProfile');

const CELL_DEG = 0.005; // ~550 m of latitude; a little less longitude
const EARTH_RADIUS_KM = 6378.1;
const DEMAND_RADIUS_KM = 15;
const AVAILABILITY_RADIUS_KM = 10;
const MAX_BOUNDS_DEG = 1.5; // gov map: at most ~165 km across — a city and its surroundings
const WAIT_SAMPLE_DAYS = 30;
const MIN_WAIT_SAMPLES = 3;
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEMAND_WINDOWS = ['today', '7d', '30d'];
const GOV_WINDOWS = ['7d', '30d', '90d'];

function minCount() {
  const n = Number(process.env.HEATMAP_MIN_COUNT);
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

// ── Cache ────────────────────────────────────────────────────────────────────
// Heatmaps are the same for everyone asking about the same place, and a
// minute-old one is as good as a fresh one.

const cache = new Map();

async function cached(key, compute) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await compute();
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearCache() {
  cache.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** When a window starts: 'today' is since midnight in India. */
function windowStart(window) {
  if (window === 'today') return new Date(`${indiaDay()}T00:00:00+05:30`);
  const days = { '7d': 7, '30d': 30, '90d': 90 }[window];
  return new Date(Date.now() - days * DAY_MS);
}

function pickWindow(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** A category slug from a query string, or null. */
function pickCategory(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value) ? value : null;
}

/** Rounds a coordinate so nearby callers share a cache entry (~1 km). */
const round2 = (x) => Math.round(x * 100) / 100;

function circle(center, radiusKm) {
  return { $geoWithin: { $centerSphere: [center, radiusKm / EARTH_RADIUS_KM] } };
}

function box({ sw, ne }) {
  return {
    $geoWithin: {
      $geometry: {
        type: 'Polygon',
        coordinates: [[[sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat]]],
      },
    },
  };
}

/** Aggregation stages that bucket `$location` into grid cells, keeping `fields` sums. */
function gridStages(sums) {
  return [
    {
      $group: {
        _id: {
          y: { $floor: { $divide: [{ $arrayElemAt: ['$location.coordinates', 1] }, CELL_DEG] } },
          x: { $floor: { $divide: [{ $arrayElemAt: ['$location.coordinates', 0] }, CELL_DEG] } },
        },
        ...sums,
      },
    },
  ];
}

const cellKey = (id) => `${id.y}:${id.x}`;

/** A grid cell id → its centre, the only position that leaves the server. */
function cellCentre(id) {
  return {
    lat: Math.round((id.y + 0.5) * CELL_DEG * 1e5) / 1e5,
    lng: Math.round((id.x + 0.5) * CELL_DEG * 1e5) / 1e5,
  };
}

/** Jobs that count as demand: everything but the client's own cancellations. */
function demandMatch(extra) {
  return { status: { $ne: 'CANCELLED' }, ...extra };
}

const JOB_SUMS = {
  jobs: { $sum: 1 },
  unfilled: { $sum: { $cond: [{ $eq: ['$status', 'EXPIRED'] }, 1, 0] } },
};

/** Busiest 3-hour stretch of the day in India, as its start hour (0–21), or null. */
async function busiestHours(match) {
  const rows = await Job.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $multiply: [{ $floor: { $divide: [{ $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } }, 3] } }, 3] },
        n: { $sum: 1 },
      },
    },
    { $sort: { n: -1, _id: 1 } },
    { $limit: 1 },
  ]);
  return rows.length && rows[0].n >= minCount() ? rows[0]._id : null;
}

// ── Worker: where is the work? ───────────────────────────────────────────────

/**
 * Jobs posted around `center` ([lng, lat]) in the window, for `categories`.
 * → { window, radiusKm, cellSizeDeg, cells: [{ lat, lng, jobs, unfilled }],
 *     summary: { jobs, unfilled, avgPrice, busiestFromHour } }
 */
function demandHeatmap({ center, categories, window }) {
  const w = pickWindow(window, DEMAND_WINDOWS, '7d');
  const c = [round2(center[0]), round2(center[1])];
  const cats = [...new Set(categories)].sort();
  return cached(`demand|${c}|${cats}|${w}`, async () => {
    const match = demandMatch({
      location: circle(c, DEMAND_RADIUS_KM),
      createdAt: { $gte: windowStart(w) },
      ...(cats.length ? { category: { $in: cats } } : {}),
    });

    const [cells, totals, busiestFromHour] = await Promise.all([
      Job.aggregate([{ $match: match }, ...gridStages(JOB_SUMS)]),
      Job.aggregate([{ $match: match }, { $group: { _id: null, ...JOB_SUMS, avgPrice: { $avg: '$price' } } }]),
      busiestHours(match),
    ]);
    const t = totals[0] ?? { jobs: 0, unfilled: 0, avgPrice: null };
    return {
      window: w,
      radiusKm: DEMAND_RADIUS_KM,
      cellSizeDeg: CELL_DEG,
      cells: cells
        .filter((cell) => cell.jobs >= minCount())
        .map((cell) => ({ ...cellCentre(cell._id), jobs: cell.jobs, unfilled: cell.unfilled })),
      summary: {
        jobs: t.jobs,
        unfilled: t.unfilled,
        avgPrice: t.avgPrice == null ? null : Math.round(t.avgPrice),
        busiestFromHour,
      },
    };
  });
}

// ── Client: is help available near me? ──────────────────────────────────────

/** Median minutes from posting to a worker accepting, for jobs like this nearby. */
async function typicalWaitMins(c, category) {
  const jobs = await Job.find({
    location: circle(c, AVAILABILITY_RADIUS_KM),
    assignedAt: { $ne: null },
    createdAt: { $gte: new Date(Date.now() - WAIT_SAMPLE_DAYS * DAY_MS) },
    ...(category ? { category } : {}),
  })
    .select('createdAt assignedAt')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const waits = jobs
    .map((j) => (j.assignedAt - j.createdAt) / 60000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  if (waits.length < MIN_WAIT_SAMPLES) return null;
  const mid = Math.floor(waits.length / 2);
  const median = waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2;
  return Math.max(1, Math.round(median));
}

/**
 * Workers online now around `center`, for `category` (any skill if null).
 * → { radiusKm, cellSizeDeg, cells: [{ lat, lng, workers }],
 *     summary: { workersOnline, typicalWaitMins } }
 */
function availabilityHeatmap({ center, category, viewerId }) {
  const c = [round2(center[0]), round2(center[1])];
  return cached(`avail|${c}|${category ?? ''}|${viewerId}`, async () => {
    const match = {
      isActive: true,
      isOnline: true,
      lastSeenAt: { $gte: new Date(Date.now() - PRESENCE_TTL_MS) },
      location: circle(c, AVAILABILITY_RADIUS_KM),
      user: { $ne: viewerId }, // a worker checking as a client doesn't count themselves
      ...(category ? { skills: category } : {}),
    };
    const [cells, workersOnline, wait] = await Promise.all([
      WorkerProfile.aggregate([{ $match: match }, ...gridStages({ workers: { $sum: 1 } })]),
      WorkerProfile.countDocuments(match),
      typicalWaitMins(c, category),
    ]);
    return {
      radiusKm: AVAILABILITY_RADIUS_KM,
      cellSizeDeg: CELL_DEG,
      cells: cells
        .filter((cell) => cell.workers >= minCount())
        .map((cell) => ({ ...cellCentre(cell._id), workers: cell.workers })),
      summary: { workersOnline, typicalWaitMins: wait },
    };
  });
}

// ── Government: where are skills short? ──────────────────────────────────────

/**
 * Reads "lat,lng" bounds from the query. Returns { sw, ne } or throws a
 * { code, message } for the caller.
 */
function parseBounds(swRaw, neRaw) {
  const parse = (s) => {
    const [lat, lng] = String(s ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  };
  const sw = parse(swRaw);
  const ne = parse(neRaw);
  if (!sw || !ne || sw.lat >= ne.lat || sw.lng >= ne.lng) {
    throw { code: 'heatmap_bounds_invalid', message: 'Map bounds are missing or invalid.' };
  }
  if (ne.lat - sw.lat > MAX_BOUNDS_DEG || ne.lng - sw.lng > MAX_BOUNDS_DEG) {
    throw { code: 'heatmap_area_too_large', message: 'Zoom in to a city to see the map.' };
  }
  return { sw, ne };
}

/**
 * Demand and supply inside `bounds`, per cell and per category.
 * cells: [{ lat, lng, jobs, unfilled, workers, shortage }] where shortage is
 *   jobs per registered worker in the cell (jobs when it has none).
 * categories: [{ category, jobs, unfilled, unfilledRate, workers }], most
 *   unfilled first — the trades most worth training people in here.
 */
function govHeatmap({ bounds, category, window }) {
  const w = pickWindow(window, GOV_WINDOWS, '30d');
  const r = (p) => `${round2(p.lat)},${round2(p.lng)}`;
  return cached(`gov|${r(bounds.sw)}|${r(bounds.ne)}|${category ?? ''}|${w}`, async () => {
    const area = box(bounds);
    const jobMatch = demandMatch({
      location: area,
      createdAt: { $gte: windowStart(w) },
      ...(category ? { category } : {}),
    });
    // Registered workers at their last known position, online or not.
    const workerMatch = { isActive: true, location: area, ...(category ? { skills: category } : {}) };

    const [jobCells, workerCells, jobCats, workerCats] = await Promise.all([
      Job.aggregate([{ $match: jobMatch }, ...gridStages(JOB_SUMS)]),
      WorkerProfile.aggregate([{ $match: workerMatch }, ...gridStages({ workers: { $sum: 1 } })]),
      Job.aggregate([{ $match: jobMatch }, { $group: { _id: '$category', ...JOB_SUMS } }]),
      WorkerProfile.aggregate([
        { $match: workerMatch },
        { $unwind: '$skills' },
        ...(category ? [{ $match: { skills: category } }] : []),
        { $group: { _id: '$skills', workers: { $sum: 1 } } },
      ]),
    ]);

    const merged = new Map();
    for (const cell of jobCells) {
      merged.set(cellKey(cell._id), { id: cell._id, jobs: cell.jobs, unfilled: cell.unfilled, workers: 0 });
    }
    for (const cell of workerCells) {
      const m = merged.get(cellKey(cell._id)) ?? { id: cell._id, jobs: 0, unfilled: 0, workers: 0 };
      m.workers = cell.workers;
      merged.set(cellKey(cell._id), m);
    }
    const min = minCount();
    const cells = [...merged.values()]
      .filter((m) => m.jobs >= min || m.workers >= min)
      .map((m) => ({
        ...cellCentre(m.id),
        // A side under the threshold reads as 0 rather than revealing a single point.
        jobs: m.jobs >= min ? m.jobs : 0,
        unfilled: m.jobs >= min ? m.unfilled : 0,
        workers: m.workers >= min ? m.workers : 0,
      }))
      .map((m) => ({ ...m, shortage: Math.round((m.jobs / Math.max(m.workers, 1)) * 10) / 10 }));

    const workersBy = new Map(workerCats.map((c) => [c._id, c.workers]));
    const categories = jobCats
      .map((c) => ({
        category: c._id,
        jobs: c.jobs,
        unfilled: c.unfilled,
        unfilledRate: Math.round((c.unfilled / c.jobs) * 100) / 100,
        workers: workersBy.get(c._id) ?? 0,
      }))
      .sort((a, b) => b.unfilledRate - a.unfilledRate || b.jobs - a.jobs);

    return {
      window: w,
      cellSizeDeg: CELL_DEG,
      cells,
      categories,
      summary: {
        jobs: jobCats.reduce((s, c) => s + c.jobs, 0),
        unfilled: jobCats.reduce((s, c) => s + c.unfilled, 0),
        workers: await WorkerProfile.countDocuments(workerMatch),
      },
    };
  });
}

module.exports = {
  CELL_DEG,
  availabilityHeatmap,
  clearCache,
  demandHeatmap,
  govHeatmap,
  parseBounds,
  pickCategory,
};
