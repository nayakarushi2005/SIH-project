/**
 * Posts sample jobs near a worker, for testing worker mode end to end.
 *
 *   npm run seed:jobs                    # near the most recently seen worker
 *   npm run seed:jobs -- --near <userId> # near a specific worker
 *   npm run seed:jobs -- --clear         # delete all seeded jobs
 *   npm run seed:jobs -- --redispatch    # run the next round for seeded jobs
 *                                        # still searching, without waiting out
 *                                        # the offer timeout
 *
 * Jobs are posted by a dedicated "Seed Client" account (a worker is never
 * offered their own jobs) and dispatched straight away, so matching workers
 * get the offers within seconds — the dispatcher must be running.
 * Photos are freely licensed images from Wikimedia Commons, uploaded once to
 * Cloudinary and reused on later runs.
 */
const path = require('path');
const mongoose = require('mongoose');
// backend/.env, whichever directory the script is run from
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Job = require('../models/Job');
const User = require('../models/User');
const WorkerProfile = require('../models/WorkerProfile');
const { jobPhotoFolder, signUpload } = require('../services/cloudinary');
const { advanceNow, startDispatch } = require('../services/dispatch');

const SEED_CLIENT = {
  googleId: 'seed-client',
  googleEmail: 'seed-client1@example.com',
  name: 'Seed Client',
  isAadhaarVerified: true,
  detailsSource: 'manual',
};

const WIKIMEDIA = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const PHOTOS = {
  panel1: `${WIKIMEDIA}/c/c7/Small_house_distribution_panel_1.jpg/960px-Small_house_distribution_panel_1.jpg`, // CC0
  panel2: `${WIKIMEDIA}/1/12/Small_house_distribution_panel_2.jpg/960px-Small_house_distribution_panel_2.jpg`, // CC0
  socket: `${WIKIMEDIA}/e/e7/European_electric_socket_%289649876%29.jpg/960px-European_electric_socket_%289649876%29.jpg`, // public domain
  iron: `${WIKIMEDIA}/e/ec/Iron_plugged_into_wall_socket.JPG/960px-Iron_plugged_into_wall_socket.JPG`, // CC BY-SA 3.0
  fan: `${WIKIMEDIA}/c/c6/Int%C3%A9rieur_de_kha%C3%AFma_avec_ventilateur.jpg/960px-Int%C3%A9rieur_de_kha%C3%AFma_avec_ventilateur.jpg`, // CC BY-SA 4.0
  sink: `${WIKIMEDIA}/6/68/Messy_kitchen_sink.jpg/960px-Messy_kitchen_sink.jpg`, // CC BY-SA 4.0
  roller: `${WIKIMEDIA}/c/c0/Paint_roller_4.jpg/960px-Paint_roller_4.jpg`, // CC BY 2.0
  door: `${WIKIMEDIA}/a/a9/Kashira_broken_doors_01.JPG/960px-Kashira_broken_doors_01.JPG`, // CC BY-SA 3.0
};

// km/bearing place each job around the worker. Within 3 km = offered in the
// first dispatch round.
const SAMPLES = [
  {
    category: 'electrician',
    description: 'Bedroom ceiling fan makes a grinding noise and runs very slowly. Probably needs a new capacitor.',
    price: 350, mins: 60, km: 0.8, bearing: 40, photos: ['fan'],
    address: 'House 14, near Hanuman Mandir',
  },
  {
    category: 'electrician',
    description: 'Two kitchen sockets stopped working after a spark. Please check the wiring and replace both sockets.',
    price: 600, mins: 120, km: 1.5, bearing: 160, photos: ['socket', 'iron'],
    address: 'Flat 3B, Shanti Apartments',
    unverifiedClient: true,
  },
  {
    category: 'electrician',
    description: 'MCB keeps tripping whenever the geyser is switched on. Need the distribution board inspected.',
    price: 800, mins: 120, km: 2.2, bearing: 250, photos: ['panel1', 'panel2'],
    address: null,
  },
  {
    category: 'electrician',
    description: 'Fit 4 LED tube lights and one new power socket in a newly built room.',
    price: 1200, mins: 240, km: 2.8, bearing: 320, photos: ['panel2', 'socket'],
    address: 'Plot 27, behind the post office',
  },
  {
    category: 'plumber',
    description: 'Kitchen sink is blocked and water drains very slowly. Smells bad too.',
    price: 400, mins: 60, km: 1.2, bearing: 90, photos: ['sink'],
    address: 'House 5, Gali no. 2',
  },
  {
    category: 'painter',
    description: 'Repaint one 12x12 ft bedroom, walls only, in a light colour. Paint will be provided.',
    price: 4500, mins: 480, km: 1.9, bearing: 200, photos: ['roller'],
    address: null,
  },
  {
    category: 'carpenter',
    description: 'Main wooden door does not close properly and the lock is loose. Needs planing and refitting.',
    price: 700, mins: 120, km: 2.5, bearing: 290, photos: ['door'],
    address: 'Old house opposite the school gate',
  },
];

/** Point `km` away from [lng, lat] in compass direction `bearing` (degrees). */
function offset([lng, lat], km, bearing) {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (km * Math.cos(rad)) / 111.32;
  const dLng = (km * Math.sin(rad)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads a sample photo, backing off when Wikimedia rate-limits us (429). */
async function downloadPhoto(key) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(PHOTOS[key], {
      headers: { 'User-Agent': 'sih-seed-script/1.0 (development test data)' },
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 || attempt === 5) {
      throw new Error(`Could not download sample photo "${key}" (${res.status})`);
    }
    const waitSec = Number(res.headers.get('retry-after')) || attempt * 3;
    console.log(`   …rate-limited downloading "${key}", retrying in ${waitSec}s`);
    await sleep(waitSec * 1000);
  }
}

/** Uploads a sample photo into the seed client's folder once; later runs reuse it. */
async function uploadPhoto(clientId, key) {
  const bytes = await downloadPhoto(key);

  const sig = signUpload({
    folder: jobPhotoFolder(clientId),
    overwrite: 'false',
    public_id: `seed-${key}`,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const form = new FormData();
  form.append('file', `data:image/jpeg;base64,${bytes.toString('base64')}`);
  for (const field of ['folder', 'overwrite', 'public_id', 'timestamp', 'signature']) {
    form.append(field, String(sig[field]));
  }
  form.append('api_key', sig.apiKey);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`Cloudinary upload failed for "${key}": ${body?.error?.message}`);
  return body.secure_url;
}

async function clearSeededJobs(client) {
  const jobs = await Job.find({ client: client._id }).select('_id');
  const ids = jobs.map((j) => j._id);
  const freed = await WorkerProfile.updateMany({ currentJob: { $in: ids } }, { currentJob: null });
  const { deletedCount } = await Job.deleteMany({ _id: { $in: ids } });
  console.log(`🧹 Deleted ${deletedCount} seeded job(s); freed ${freed.modifiedCount} worker(s).`);
}

async function redispatchSeededJobs(client) {
  const jobs = await Job.find({ client: client._id, status: 'SEARCHING' }).select('_id category dispatch.round');
  for (const job of jobs) {
    await advanceNow(job._id, job.dispatch.round);
    console.log(`   ↻ ${job.category.padEnd(11)} round ${job.dispatch.round + 1} queued now`);
  }
  console.log(`Re-dispatched ${jobs.length} searching job(s).`);
}

async function findTargetWorker(nearUserId) {
  const query = { 'location.coordinates': { $exists: true } };
  if (nearUserId) query.user = nearUserId;
  const worker = await WorkerProfile.findOne(query).sort({ lastSeenAt: -1 });
  if (!worker) {
    throw new Error(
      nearUserId
        ? `No worker with a location for user ${nearUserId}. Go online in the app first.`
        : 'No worker has a location yet. Register as a worker and go online in the app first.'
    );
  }
  return worker;
}

async function main() {
  const args = process.argv.slice(2);
  const nearIndex = args.indexOf('--near');
  const nearUserId = nearIndex >= 0 ? args[nearIndex + 1] : null;

  await mongoose.connect(process.env.MONGODB_URI);

  const client = await User.findOneAndUpdate(
    { googleId: SEED_CLIENT.googleId },
    { $setOnInsert: SEED_CLIENT },
    { upsert: true, new: true }
  );

  if (args.includes('--clear')) {
    await clearSeededJobs(client);
    return;
  }
  if (args.includes('--redispatch')) {
    await redispatchSeededJobs(client);
    return;
  }

  const worker = await findTargetWorker(nearUserId);
  const center = worker.location.coordinates;
  console.log(
    `📍 Posting near worker ${worker.user} (${worker.skills.join(', ')}; ` +
      `${worker.isOnline ? 'online' : 'OFFLINE — go online to get offers'}) ` +
      `at ${center[1].toFixed(4)}, ${center[0].toFixed(4)}`
  );

  const photoUrls = {};
  for (const key of new Set(SAMPLES.flatMap((s) => s.photos))) {
    photoUrls[key] = await uploadPhoto(client._id, key);
    await sleep(1000); // be gentle with Wikimedia
  }
  console.log(`🖼  ${Object.keys(photoUrls).length} sample photos ready on Cloudinary`);

  for (const s of SAMPLES) {
    const job = await Job.create({
      client: client._id,
      category: s.category,
      description: s.description,
      photos: s.photos.map((key) => photoUrls[key]),
      price: s.price,
      expectedDurationMins: s.mins,
      location: { type: 'Point', coordinates: offset(center, s.km, s.bearing) },
      address: s.address,
      clientAadhaarVerified: !s.unverifiedClient,
    });
    await startDispatch(job._id);
    const match = worker.skills.includes(s.category) ? '→ offered to this worker' : '(other trade)';
    console.log(`   ✅ ${s.category.padEnd(11)} ₹${String(s.price).padEnd(5)} ${s.km} km  ${match}`);
  }

  console.log(`\nPosted ${SAMPLES.length} jobs as "${SEED_CLIENT.name}". Remove them with: npm run seed:jobs -- --clear`);
}

main()
  .catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    process.exit(); // the dispatch queue keeps a Redis connection open
  });
