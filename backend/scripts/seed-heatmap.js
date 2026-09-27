/**
 * Fills the heatmaps with a month of realistic demo data around a city:
 * past jobs clustered in a few neighbourhoods (some with lots of unfilled
 * jobs — the "shortage" areas), and nearby workers, some online.
 *
 *   npm run seed:heatmap                          # around the most recently seen worker, else Mumbai
 *   npm run seed:heatmap -- --near 18.52,73.85    # around a lat,lng
 *   npm run seed:heatmap -- --keep-online         # also keep the seeded workers "online"
 *                                                 # (presence lasts 3 min) until Ctrl-C
 *   npm run seed:heatmap -- --clear               # remove everything this script made
 *
 * HEATMAP_DEMO_CENTER=lat,lng in backend/.env works like --near.
 *
 * The jobs are finished history (COMPLETED / EXPIRED), so the dispatcher
 * ignores them. Seeded workers carry a placeholder currentJob, so they are
 * never offered real jobs, yet still show on the maps.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Job = require('../models/Job');
const User = require('../models/User');
const WorkerProfile = require('../models/WorkerProfile');

const SEED_CLIENT = { googleId: 'seed-heatmap-client', googleEmail: 'seed-heatmap-client@example.com', name: 'Heatmap Demo Client' };
const WORKER_PREFIX = 'seed-heatmap-worker-';
const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 }; // Mumbai
const PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Messy_kitchen_sink.jpg/960px-Messy_kitchen_sink.jpg';
const DAY = 24 * 60 * 60 * 1000;
const BUSY = new mongoose.Types.ObjectId(); // placeholder currentJob: never dispatched to

// Neighbourhoods around the centre: where they are, how busy, what's asked
// for, and how often jobs there go unfilled.
const HOTSPOTS = [
  { km: 1.2, bearing: 20, jobs: 70, unfilledRate: 0.1, mix: { plumber: 3, electrician: 3, cleaning: 2, maid: 2 } },
  { km: 3.5, bearing: 110, jobs: 55, unfilledRate: 0.45, mix: { electrician: 3, ac_repair: 3, carpenter: 1 } },
  { km: 5.0, bearing: 200, jobs: 40, unfilledRate: 0.6, mix: { plumber: 2, mason: 2, painter: 2 } },
  { km: 2.5, bearing: 290, jobs: 60, unfilledRate: 0.15, mix: { cook: 2, maid: 3, babysitter: 1 } },
  { km: 6.5, bearing: 60, jobs: 30, unfilledRate: 0.35, mix: { car_mechanic: 2, bike_mechanic: 2, driver: 1 } },
  { km: 4.0, bearing: 330, jobs: 35, unfilledRate: 0.25, mix: { carpenter: 2, painter: 2, pest_control: 1 } },
];
const WORKERS = { online: 30, offline: 25 };
const SKILLS = ['plumber', 'electrician', 'cleaning', 'maid', 'ac_repair', 'carpenter', 'painter', 'cook', 'mason', 'bike_mechanic'];
const PRICES = { plumber: 400, electrician: 450, cleaning: 800, maid: 600, ac_repair: 700, carpenter: 900, mason: 1200, painter: 1500, cook: 500, babysitter: 700, car_mechanic: 1000, bike_mechanic: 350, driver: 800, pest_control: 1100 };

// Deterministic, so every run draws the same map.
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

/** The point `km` away from `p` on compass `bearing`. */
function offset(p, km, bearing) {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (km * Math.cos(rad)) / 111.32;
  const dLng = (km * Math.sin(rad)) / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** Scattered around `p` with a spread of about `km`. */
const scatter = (p, km) => offset(p, Math.abs(gauss()) * km, rand() * 360);

function pickWeighted(mix) {
  const total = Object.values(mix).reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (const [key, w] of Object.entries(mix)) {
    r -= w;
    if (r <= 0) return key;
  }
  return Object.keys(mix)[0];
}

/** A time in the last 30 days, mostly mornings (7–10) and evenings (18–21) IST. */
function postedAt() {
  const daysAgo = Math.floor(rand() * 30);
  const r = rand();
  const hourIst = r < 0.35 ? 7 + rand() * 3 : r < 0.8 ? 18 + rand() * 3 : 10 + rand() * 8;
  const d = new Date(Date.now() - daysAgo * DAY);
  const midnightIst = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 5.5 * 3600 * 1000;
  return new Date(Math.min(midnightIst + hourIst * 3600 * 1000, Date.now() - 60 * 60 * 1000));
}

const point = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });

async function resolveCenter(arg) {
  const raw = arg || process.env.HEATMAP_DEMO_CENTER;
  if (raw) {
    const [lat, lng] = raw.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`Bad centre "${raw}" — use lat,lng`);
    return { lat, lng };
  }
  const recent = await WorkerProfile.findOne({
    'location.coordinates': { $exists: true },
    user: { $nin: await seededWorkerIds() },
  })
    .sort({ lastSeenAt: -1 })
    .lean();
  if (recent) return { lat: recent.location.coordinates[1], lng: recent.location.coordinates[0] };
  return DEFAULT_CENTER;
}

async function seededWorkerIds() {
  const users = await User.find({ googleId: { $regex: `^${WORKER_PREFIX}` } }).select('_id').lean();
  return users.map((u) => u._id);
}

async function clear() {
  const client = await User.findOne({ googleId: SEED_CLIENT.googleId });
  const workers = await seededWorkerIds();
  const jobs = client ? await Job.deleteMany({ client: client._id }) : { deletedCount: 0 };
  await WorkerProfile.deleteMany({ user: { $in: workers } });
  await User.deleteMany({ _id: { $in: workers } });
  if (client) await client.deleteOne();
  console.log(`Removed ${jobs.deletedCount} jobs and ${workers.length} workers.`);
}

async function seed(center) {
  await clear();
  const client = await User.create({ ...SEED_CLIENT, isAadhaarVerified: true, detailsSource: 'manual' });

  const jobs = [];
  for (const spot of HOTSPOTS) {
    const hub = offset(center, spot.km, spot.bearing);
    for (let i = 0; i < spot.jobs; i += 1) {
      const category = pickWeighted(spot.mix);
      const createdAt = postedAt();
      const unfilled = rand() < spot.unfilledRate;
      const waitMins = 3 + Math.round(Math.abs(gauss()) * (8 + spot.unfilledRate * 30));
      const assignedAt = unfilled ? null : new Date(createdAt.getTime() + waitMins * 60000);
      const price = Math.round(((PRICES[category] ?? 500) * (0.8 + rand() * 0.5)) / 50) * 50;
      jobs.push({
        client: client._id,
        category,
        description: 'Demo job for the heatmap (seeded).',
        photos: [PHOTO],
        price,
        expectedDurationMins: 60,
        location: point(scatter(hub, 0.6)),
        clientAadhaarVerified: true,
        status: unfilled ? 'EXPIRED' : 'COMPLETED',
        createdAt,
        updatedAt: createdAt,
        assignedAt,
        startedAt: assignedAt && new Date(assignedAt.getTime() + 30 * 60000),
        completedAt: assignedAt && new Date(assignedAt.getTime() + 90 * 60000),
        expiredAt: unfilled ? new Date(createdAt.getTime() + 20 * 60000) : null,
      });
    }
  }
  await Job.insertMany(jobs, { timestamps: false });

  // Workers cluster around the well-served neighbourhoods, thin out in the
  // shortage ones — which is what the government map should reveal.
  const total = WORKERS.online + WORKERS.offline;
  for (let i = 0; i < total; i += 1) {
    const spot = HOTSPOTS[Math.floor(rand() * HOTSPOTS.length)];
    if (rand() < spot.unfilledRate) continue; // fewer workers where jobs go unfilled
    const online = i < WORKERS.online;
    const user = await User.create({
      googleId: `${WORKER_PREFIX}${i}`,
      googleEmail: `${WORKER_PREFIX}${i}@example.com`,
      name: `Demo Worker ${i + 1}`,
      isWorker: true,
      isAadhaarVerified: true,
      detailsSource: 'manual',
    });
    const skills = [...new Set([pickWeighted(spot.mix), SKILLS[Math.floor(rand() * SKILLS.length)]])];
    await WorkerProfile.create({
      user: user._id,
      skills,
      isOnline: online,
      lastSeenAt: new Date(),
      location: point(scatter(offset(center, spot.km, spot.bearing), 0.35)),
      currentJob: BUSY,
    });
  }

  const workers = await seededWorkerIds();
  const unfilled = jobs.filter((j) => j.status === 'EXPIRED').length;
  console.log(
    `Seeded ${jobs.length} jobs (${unfilled} unfilled) and ${workers.length} workers around ${center.lat.toFixed(4)},${center.lng.toFixed(4)}.`
  );
}

async function keepOnline() {
  console.log('Keeping seeded workers online — Ctrl-C to stop.');
  const beat = async () => {
    const workers = await seededWorkerIds();
    await WorkerProfile.updateMany({ user: { $in: workers }, isOnline: true }, { lastSeenAt: new Date() });
  };
  await beat();
  setInterval(() => beat().catch((err) => console.error('Heartbeat failed:', err.message)), 60 * 1000);
}

async function main() {
  const args = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sih-database');
  if (args.includes('--clear')) {
    await clear();
  } else {
    const near = args.includes('--near') ? args[args.indexOf('--near') + 1] : null;
    await seed(await resolveCenter(near));
    if (args.includes('--keep-online')) {
      await keepOnline();
      return; // runs until interrupted
    }
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
