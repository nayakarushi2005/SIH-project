# Phase 1 — Category Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A curated, 6-language Indian gig category taxonomy stored in MongoDB, served by `GET /api/categories`, and used by the mobile app instead of the hard-coded service list.

**Architecture:** Taxonomy lives in `backend/data/categories.json` (source of truth in git), is upserted into `Category` / `CategoryGroup` collections by an idempotent seed script, and is read through a small service used by a public Express route. The app fetches it through a `useCategories` hook with an in-memory cache and a bundled fallback so the home screen never renders empty.

**Tech Stack:** Node 26 / Express 4 / Mongoose 8, jest + supertest + mongodb-memory-server (new dev deps), Expo SDK 57 / Expo Router.

**Spec:** `docs/superpowers/specs/2026-09-26-worker-onboarding-agent-design.md` (§3.1, §4.1 first row, §2 Phase 1)

## Global Constraints

- Languages: exactly `en, hi, mr, bn, ta, te` — reuse `LANGUAGES` from `backend/services/profile.js`.
- Every category and group has a non-empty name in all 6 languages; `hi`/`mr` in Devanagari, `bn` in Bengali script, `ta` in Tamil, `te` in Telugu.
- `synonyms` has an array for all 6 languages; `hi` includes romanised forms (e.g. `bijli wala`).
- Slugs are lower snake_case and never change once shipped (worker profiles will store them).
- `icon` must be a valid `MaterialCommunityIcons` name.
- Same list for every city; `disabledCities` (lower-cased) hides a category in that city.
- `GET /api/categories` is public (no auth).
- Existing app slugs stay valid: `electrician, cleaning, plumber, carpenter, painter, caregiver, driver, gardener, technician`.

## Review Focus

1. Unsupported or missing `lang` (e.g. `?lang=fr`, `?lang=`) → responds in English, never 500. Tested in Task 4.
2. City matching is case/space-insensitive (`?city=  PUNE `) → hides categories disabled for `pune`. Tested in Task 4.
3. Re-running the seed after a category is removed from the JSON → it becomes `isActive:false` (not deleted, so stored worker slugs stay resolvable) and disappears from the API. Tested in Task 3.
4. Groups whose categories are all inactive/disabled are omitted rather than returned empty. Tested in Task 4.
5. App offline / backend down on first launch → home still shows "Most booked" from the bundled fallback. Checked manually in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app.js` (new) | Builds and exports the Express app (routes, middleware). No DB connect / listen. |
| `backend/server.js` (modify) | Connects Mongo, then `app.listen`. |
| `backend/models/Category.js` (new) | Category schema. |
| `backend/models/CategoryGroup.js` (new) | Group schema. |
| `backend/data/categories.json` (new) | Taxonomy source of truth. |
| `backend/scripts/seedCategories.js` (new) | `seedCategories(data)` + CLI entry. |
| `backend/services/categories.js` (new) | `listCategories({ lang, city, withSynonyms })`. |
| `backend/routes/categories.js` (new) | `GET /api/categories`. |
| `backend/tests/setup.js` (new) | mongodb-memory-server lifecycle helpers. |
| `backend/tests/*.test.js` (new) | Tests. |
| `backend/Dockerfile` (modify) | Copy new dirs (and the already-missing `controllers/`, `utils/`). |
| `client-native/src/services/api.js` (modify) | `getCategories(lang)`. |
| `client-native/src/hooks/useCategories.js` (new) | Fetch + cache + fallback, `bySlug` lookup. |
| `client-native/src/constants/services.js` (modify) | Becomes the offline fallback + banners + most-booked slugs. |
| `client-native/src/app/(tabs)/home.js`, `app/create-job.js` (modify) | Use the hook. |

---

### Task 1: Backend test harness and app/server split

**Files:**
- Create: `backend/app.js`, `backend/tests/setup.js`, `backend/tests/health.test.js`
- Modify: `backend/server.js`, `backend/package.json`, `backend/Dockerfile`

**Interfaces:**
- Produces: `require('../app')` → Express app; `tests/setup.js` exports `connect()`, `clear()`, `close()`.

- [ ] **Step 1: Install dev deps**

Run: `cd backend && npm install --save-dev jest supertest mongodb-memory-server`
Add to `package.json` scripts: `"test": "jest --runInBand"`, and `"jest": { "testEnvironment": "node", "testTimeout": 30000 }`.

- [ ] **Step 2: Write the failing test** — `backend/tests/health.test.js`

```js
const request = require('supertest');
const app = require('../app');

test('GET /api/health responds ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module '../app'`): `npm test`

- [ ] **Step 4: Split server.js** — move everything above "MongoDB Connection" into `app.js` ending with `module.exports = app;` (keep `require('dotenv').config()` in `app.js`). `server.js` becomes:

```js
const mongoose = require('mongoose');
const app = require('./app');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sih-database';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
```

`backend/tests/setup.js`:

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

async function close() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connect, clear, close };
```

Dockerfile: add `COPY app.js ./`, `COPY controllers/ ./controllers/`, `COPY utils/ ./utils/`, `COPY data/ ./data/`, `COPY scripts/ ./scripts/` next to the existing COPY lines.

- [ ] **Step 5: Run — expect PASS**: `npm test`

- [ ] **Step 6: Commit** — `git commit -m "backend: split app from server, add jest harness"`

---

### Task 2: Models and taxonomy data

**Files:**
- Create: `backend/models/Category.js`, `backend/models/CategoryGroup.js`, `backend/data/categories.json`, `backend/tests/categories.data.test.js`

**Interfaces:**
- Produces: models `Category`, `CategoryGroup` (fields per spec §3.1); `categories.json` shape `{ version: 1, groups: Group[], categories: Category[] }`.

- [ ] **Step 1: Write the failing data test** — `backend/tests/categories.data.test.js`

```js
const data = require('../data/categories.json');
const { LANGUAGES } = require('../services/profile');

const SCRIPTS = {
  hi: /\p{Script=Devanagari}/u,
  mr: /\p{Script=Devanagari}/u,
  bn: /\p{Script=Bengali}/u,
  ta: /\p{Script=Tamil}/u,
  te: /\p{Script=Telugu}/u,
  en: /^[\x20-\x7E]+$/,
};
const SLUG = /^[a-z][a-z0-9_]*$/;

function expectNames(names, where) {
  for (const lang of LANGUAGES) {
    const value = names?.[lang];
    expect({ where, lang, ok: typeof value === 'string' && value.trim().length > 0 }).toEqual({ where, lang, ok: true });
    expect({ where, lang, script: SCRIPTS[lang].test(value) }).toEqual({ where, lang, script: true });
  }
}

test('groups are unique and fully translated', () => {
  const slugs = data.groups.map((g) => g.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const g of data.groups) {
    expect(g.slug).toMatch(SLUG);
    expectNames(g.names, g.slug);
  }
});

test('categories are unique, grouped, translated and have synonyms', () => {
  const groupSlugs = new Set(data.groups.map((g) => g.slug));
  const slugs = data.categories.map((c) => c.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  expect(slugs.length).toBeGreaterThanOrEqual(60);
  for (const c of data.categories) {
    expect(c.slug).toMatch(SLUG);
    expect(groupSlugs.has(c.group)).toBe(true);
    expectNames(c.names, c.slug);
    for (const lang of LANGUAGES) expect(Array.isArray(c.synonyms?.[lang])).toBe(true);
    expect(c.synonyms.hi.length).toBeGreaterThan(0);
    expect(typeof c.icon).toBe('string');
  }
});

test('legacy app slugs still exist', () => {
  const slugs = new Set(data.categories.map((c) => c.slug));
  for (const s of ['electrician', 'cleaning', 'plumber', 'carpenter', 'painter', 'caregiver', 'driver', 'gardener', 'technician']) {
    expect(slugs.has(s)).toBe(true);
  }
});
```

- [ ] **Step 2: Run — expect FAIL** (missing JSON): `npm test -- categories.data`

- [ ] **Step 3: Write models**

`backend/models/CategoryGroup.js`:

```js
const mongoose = require('mongoose');
const { LANGUAGES } = require('../services/profile');

const names = Object.fromEntries(LANGUAGES.map((l) => [l, { type: String, required: true }]));

const categoryGroupSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    names,
    icon: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CategoryGroup', categoryGroupSchema);
```

`backend/models/Category.js`:

```js
const mongoose = require('mongoose');
const { LANGUAGES } = require('../services/profile');

const names = Object.fromEntries(LANGUAGES.map((l) => [l, { type: String, required: true }]));
const synonyms = Object.fromEntries(LANGUAGES.map((l) => [l, { type: [String], default: [] }]));

/**
 * A job category workers register for and customers book. `slug` is the
 * stable id stored on worker profiles — never rename one; retire it with
 * isActive:false instead.
 */
const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    group: { type: String, required: true, index: true }, // CategoryGroup slug
    ncoCode: { type: String, default: null }, // NCO-2015 / ISCO-08 unit group
    names,
    synonyms, // extra words people say for this job, used for voice matching
    icon: { type: String, required: true }, // MaterialCommunityIcons name
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    disabledCities: { type: [String], default: [] }, // lower-cased city names
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
```

- [ ] **Step 4: Write `backend/data/categories.json`**

Shape (two complete entries shown; every entry follows it exactly):

```json
{
  "version": 1,
  "groups": [
    { "slug": "home_services", "icon": "home-city", "sortOrder": 1,
      "names": { "en": "Home services", "hi": "घरेलू सेवाएँ", "mr": "घरगुती सेवा", "bn": "গৃহ পরিষেবা", "ta": "வீட்டு சேவைகள்", "te": "ఇంటి సేవలు" } }
  ],
  "categories": [
    { "slug": "electrician", "group": "home_services", "ncoCode": "7411", "icon": "flash", "sortOrder": 1,
      "names": { "en": "Electrician", "hi": "इलेक्ट्रीशियन", "mr": "इलेक्ट्रिशियन", "bn": "ইলেকট্রিশিয়ান", "ta": "மின்பணியாளர்", "te": "ఎలక్ట్రీషియన్" },
      "synonyms": { "en": ["wireman", "electric work", "wiring"], "hi": ["बिजली वाला", "बिजली मिस्त्री", "bijli wala", "bijli mistri", "wireman"],
                    "mr": ["वायरमन", "लाईट काम"], "bn": ["ইলেকট্রিক মিস্ত্রি"], "ta": ["எலக்ட்ரீஷியன்", "வயர்மேன்"], "te": ["కరెంటు పని", "వైర్‌మెన్"] },
      "disabledCities": [] }
  ]
}
```

Groups (sortOrder in this order) and categories (`slug` — English name — ncoCode — icon). ncoCode is the 4-digit ISCO-08 / NCO-2015 unit group, `null` where no single unit group fits:

1. `home_services` (home-city): `electrician` Electrician 7411 flash · `plumber` Plumber 7126 pipe-wrench · `carpenter` Carpenter 7115 hand-saw · `painter` Painter 7131 format-paint · `cleaning` House cleaning 9111 broom · `pest_control` Pest control 7544 bug · `gardener` Gardener 9214 flower · `water_tank_cleaning` Water tank cleaning 9129 water · `sofa_carpet_cleaning` Sofa & carpet cleaning 9129 sofa · `locksmith` Locksmith 7222 key-variant
2. `repair_maintenance` (tools): `technician` Appliance technician 7412 tools · `ac_repair` AC & fridge repair 7127 air-conditioner · `mobile_repair` Mobile phone repair 7422 cellphone-cog · `computer_repair` Computer & laptop repair 7422 laptop · `tv_electronics_repair` TV & electronics repair 7421 television · `ro_service` RO / water purifier service 7412 water-pump · `bike_mechanic` Two-wheeler mechanic 7231 motorbike · `car_mechanic` Car mechanic 7231 car-wrench · `cctv_installation` CCTV installation 7422 cctv · `welder` Welder & fabricator 7212 hammer-wrench
3. `construction` (hard-hat): `mason` Mason 7112 wall · `construction_labour` Construction labourer 9313 account-hard-hat · `tile_fitter` Tile & marble fitter 7122 grid · `pop_false_ceiling` POP & false ceiling 7123 ceiling-light · `bar_bender` Bar bender 7114 wrench · `waterproofing` Waterproofing 7119 water-off · `glass_aluminium` Glass & aluminium work 7125 window-closed-variant · `road_site_worker` Road & site worker 9312 road-variant
4. `driving_transport` (steering): `driver` Car driver 8322 car · `auto_driver` Auto-rickshaw driver null rickshaw · `e_rickshaw_driver` E-rickshaw driver null rickshaw-electric · `bike_taxi` Bike taxi rider 8321 motorbike · `truck_driver` Truck driver 8332 truck · `bus_driver` Bus driver 8331 bus · `machine_operator` JCB / machine operator 8342 excavator
5. `delivery_logistics` (package-variant): `food_delivery` Food delivery 9621 moped · `parcel_delivery` Parcel delivery 9621 package-variant-closed · `grocery_delivery` Grocery delivery 9621 cart · `packers_movers` Packers & movers 9333 truck-delivery · `loader` Loader / helper 9333 dolly · `warehouse_worker` Warehouse worker 9321 warehouse
6. `domestic_help` (home-heart): `maid` Domestic help 9111 home-heart · `cook` Cook 5120 chef-hat · `babysitter` Babysitter / nanny 5311 baby-face-outline · `laundry` Laundry & ironing 9121 iron · `car_washing` Car washing 9122 car-wash
7. `care_health` (heart-pulse): `caregiver` Elderly caregiver 5322 account-heart · `patient_care` Patient care attendant 5321 hospital-box · `home_nurse` Home nurse 3221 medical-bag · `physiotherapist` Physiotherapist 2264 human
8. `beauty_wellness` (face-woman-shimmer): `beautician` Beautician 5142 lipstick · `barber` Barber / hairdresser 5141 content-cut · `mehendi_artist` Mehendi artist null hand-back-right · `makeup_artist` Makeup artist 5142 brush · `massage_therapist` Massage therapist null spa · `fitness_trainer` Yoga / fitness trainer 3423 yoga
9. `food_hospitality` (silverware-fork-knife): `catering` Catering staff 5131 silverware-fork-knife · `waiter` Waiter 5131 room-service · `street_food_vendor` Street food vendor 5212 food-variant · `hotel_housekeeping` Hotel housekeeping 9112 bed · `baker` Baker 7512 bread-slice · `kitchen_helper` Kitchen helper 9412 pot-steam
10. `events` (party-popper): `event_staff` Event staff null party-popper · `photographer` Photographer 3431 camera · `videographer` Videographer 3521 video · `dj_sound` DJ & sound 3521 speaker · `decorator` Decorator 3432 balloon · `tent_pandal` Tent & pandal work null tent
11. `tailoring_crafts` (needle): `tailor` Tailor 7531 needle · `embroidery` Embroidery / zari work 7533 flower-pollen · `cobbler` Cobbler / shoe repair 7536 shoe-formal · `potter` Potter 7314 pot-mix · `weaver` Handloom weaver 7318 texture-box · `upholstery` Upholstery 7534 sofa-single
12. `agriculture` (sprout): `farm_labour` Farm labourer 9211 sprout · `tractor_driver` Tractor driver 8341 tractor · `dairy_worker` Dairy & cattle care 9212 cow · `fishery_worker` Fishery worker 9216 fish
13. `security_facility` (shield-account): `security_guard` Security guard 5414 shield-account · `watchman` Watchman / chowkidar 5414 account-eye · `office_housekeeping` Office housekeeping 9112 spray-bottle · `sweeper` Sweeper / sanitation worker 9613 trash-can
14. `retail_office` (storefront): `shop_assistant` Shop assistant 5223 storefront · `sales_executive` Field sales executive 5243 briefcase · `data_entry` Data entry operator 4132 keyboard · `telecaller` Telecaller 4222 headset · `office_assistant` Office assistant / peon null account-tie · `cashier` Cashier 5230 cash-register · `receptionist` Receptionist 4226 desk
15. `education` (school): `home_tutor` Home tutor 2359 school · `music_teacher` Music teacher 2354 music · `driving_instructor` Driving instructor 5165 steering

`sortOrder` within a group follows the order listed. Translations: use the word people actually say for the job in that language (loanwords such as "इलेक्ट्रीशियन" are fine where that is the common term); synonyms cover colloquial and romanised forms.

- [ ] **Step 5: Validate icons exist** (run from repo root):

```bash
node -e "
const g=require('./client-native/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
const d=require('./backend/data/categories.json');
const bad=[...d.groups,...d.categories].filter(x=>!(x.icon in g)).map(x=>x.slug+':'+x.icon);
console.log(bad.length?'BAD '+bad.join(', '):'all icons valid'); process.exit(bad.length?1:0)"
```
Expected: `all icons valid` (replace any bad icon with the closest valid name and re-run).

- [ ] **Step 6: Run — expect PASS**: `npm test -- categories.data`

- [ ] **Step 7: Commit** — `git commit -m "backend: add category models and 6-language taxonomy data"`

---

### Task 3: Idempotent seed script

**Files:**
- Create: `backend/scripts/seedCategories.js`, `backend/tests/seedCategories.test.js`
- Modify: `backend/package.json` (script `"seed:categories": "node scripts/seedCategories.js"`)

**Interfaces:**
- Consumes: models from Task 2, `data/categories.json`.
- Produces: `seedCategories(data) → Promise<{ groups: number, categories: number, retired: number }>`.

- [ ] **Step 1: Write the failing test**

```js
const db = require('./setup');
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

test('seeds all groups and categories', async () => {
  const result = await seedCategories(data);
  expect(result.categories).toBe(data.categories.length);
  expect(await CategoryGroup.countDocuments()).toBe(data.groups.length);
  expect(await Category.countDocuments({ isActive: true })).toBe(data.categories.length);
});

test('is idempotent', async () => {
  await seedCategories(data);
  await seedCategories(data);
  expect(await Category.countDocuments()).toBe(data.categories.length);
});

test('retires categories removed from the file instead of deleting them', async () => {
  await seedCategories(data);
  const [, ...rest] = data.categories;
  const result = await seedCategories({ ...data, categories: rest });
  expect(result.retired).toBe(1);
  const removed = await Category.findOne({ slug: data.categories[0].slug });
  expect(removed.isActive).toBe(false);
});

test('re-activates a category that comes back', async () => {
  await seedCategories(data);
  const [, ...rest] = data.categories;
  await seedCategories({ ...data, categories: rest });
  await seedCategories(data);
  expect((await Category.findOne({ slug: data.categories[0].slug })).isActive).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**: `npm test -- seedCategories`

- [ ] **Step 3: Implement** — `backend/scripts/seedCategories.js`

```js
/**
 * Loads data/categories.json into MongoDB. Safe to run any number of times:
 * rows are upserted by slug, and categories dropped from the file are
 * retired (isActive:false) rather than deleted, because worker profiles keep
 * referring to their slugs.
 *
 *   npm run seed:categories
 */
const mongoose = require('mongoose');
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');

async function seedCategories(data) {
  await CategoryGroup.bulkWrite(
    data.groups.map((g) => ({
      updateOne: { filter: { slug: g.slug }, update: { $set: g }, upsert: true },
    }))
  );

  await Category.bulkWrite(
    data.categories.map((c) => ({
      updateOne: {
        filter: { slug: c.slug },
        update: { $set: { disabledCities: [], ...c, isActive: true } },
        upsert: true,
      },
    }))
  );

  const slugs = data.categories.map((c) => c.slug);
  const retired = await Category.updateMany(
    { slug: { $nin: slugs }, isActive: true },
    { $set: { isActive: false } }
  );

  return {
    groups: data.groups.length,
    categories: data.categories.length,
    retired: retired.modifiedCount,
  };
}

if (require.main === module) {
  require('dotenv').config();
  const data = require('../data/categories.json');
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sih-database';
  mongoose
    .connect(uri)
    .then(() => seedCategories(data))
    .then((r) => console.log(`Seeded ${r.groups} groups, ${r.categories} categories, retired ${r.retired}.`))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { seedCategories };
```

- [ ] **Step 4: Run — expect PASS**: `npm test -- seedCategories`

- [ ] **Step 5: Commit** — `git commit -m "backend: add idempotent category seed script"`

---

### Task 4: Categories service and public route

**Files:**
- Create: `backend/services/categories.js`, `backend/routes/categories.js`, `backend/tests/categories.api.test.js`
- Modify: `backend/app.js` (mount `app.use('/api/categories', categoryRoutes)`)

**Interfaces:**
- Consumes: models, `seedCategories` (tests only), `LANGUAGES`.
- Produces: `listCategories({ lang, city, withSynonyms }) → Promise<{ lang, groups: [{ slug, name, icon, categories: [{ slug, name, icon, ncoCode, synonyms? }] }] }>`; `resolveLang(lang) → string`. Response of `GET /api/categories` is exactly that object.

- [ ] **Step 1: Write the failing tests**

```js
const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Category = require('../models/Category');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');

beforeAll(db.connect);
beforeEach(() => seedCategories(data));
afterEach(db.clear);
afterAll(db.close);

const allSlugs = (body) => body.groups.flatMap((g) => g.categories.map((c) => c.slug));

test('returns grouped categories in Hindi', async () => {
  const res = await request(app).get('/api/categories?lang=hi');
  expect(res.status).toBe(200);
  expect(res.body.lang).toBe('hi');
  const electrician = res.body.groups.flatMap((g) => g.categories).find((c) => c.slug === 'electrician');
  expect(electrician.name).toBe(data.categories.find((c) => c.slug === 'electrician').names.hi);
  expect(electrician.synonyms).toBeUndefined();
  expect(allSlugs(res.body)).toHaveLength(data.categories.length);
});

test('groups and categories follow sortOrder', async () => {
  const res = await request(app).get('/api/categories');
  expect(res.body.groups[0].slug).toBe(data.groups[0].slug);
  expect(res.body.groups[0].categories[0].slug).toBe('electrician');
});

test.each(['fr', '', 'HI-IN'])('unsupported lang %p falls back to English', async (lang) => {
  const res = await request(app).get(`/api/categories?lang=${lang}`);
  expect(res.status).toBe(200);
  expect(res.body.lang).toBe('en');
});

test('withSynonyms=1 includes synonyms in the requested language only', async () => {
  const res = await request(app).get('/api/categories?lang=hi&withSynonyms=1');
  const electrician = res.body.groups.flatMap((g) => g.categories).find((c) => c.slug === 'electrician');
  expect(electrician.synonyms).toEqual(expect.arrayContaining(['bijli wala']));
});

test('hides categories disabled for the city, case-insensitively', async () => {
  await Category.updateOne({ slug: 'bus_driver' }, { $set: { disabledCities: ['pune'] } });
  const res = await request(app).get('/api/categories?city=%20%20PUNE%20');
  expect(allSlugs(res.body)).not.toContain('bus_driver');
  const other = await request(app).get('/api/categories?city=Delhi');
  expect(allSlugs(other.body)).toContain('bus_driver');
});

test('omits inactive categories and empty groups', async () => {
  await Category.updateMany({ group: 'education' }, { $set: { isActive: false } });
  const res = await request(app).get('/api/categories');
  expect(res.body.groups.map((g) => g.slug)).not.toContain('education');
});

test('sets a cache header', async () => {
  const res = await request(app).get('/api/categories');
  expect(res.headers['cache-control']).toBe('public, max-age=3600');
});
```

- [ ] **Step 2: Run — expect FAIL** (404s): `npm test -- categories.api`

- [ ] **Step 3: Implement service** — `backend/services/categories.js`

```js
/**
 * Read side of the job-category taxonomy: localised, grouped, and filtered
 * for the caller's city.
 */
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');
const { LANGUAGES } = require('./profile');

function resolveLang(lang) {
  return LANGUAGES.includes(lang) ? lang : 'en';
}

async function listCategories({ lang, city, withSynonyms = false } = {}) {
  const language = resolveLang(lang);
  const cityKey = typeof city === 'string' ? city.trim().toLowerCase() : '';

  const filter = { isActive: true };
  if (cityKey) filter.disabledCities = { $ne: cityKey };

  const [groups, categories] = await Promise.all([
    CategoryGroup.find().sort({ sortOrder: 1 }).lean(),
    Category.find(filter).sort({ sortOrder: 1 }).lean(),
  ]);

  const byGroup = new Map(groups.map((g) => [g.slug, []]));
  for (const c of categories) {
    const item = {
      slug: c.slug,
      name: c.names[language] || c.names.en,
      icon: c.icon,
      ncoCode: c.ncoCode,
    };
    if (withSynonyms) item.synonyms = c.synonyms?.[language] ?? [];
    byGroup.get(c.group)?.push(item);
  }

  return {
    lang: language,
    groups: groups
      .filter((g) => byGroup.get(g.slug).length > 0)
      .map((g) => ({
        slug: g.slug,
        name: g.names[language] || g.names.en,
        icon: g.icon,
        categories: byGroup.get(g.slug),
      })),
  };
}

module.exports = { listCategories, resolveLang };
```

- [ ] **Step 4: Implement route** — `backend/routes/categories.js`, mount in `app.js`

```js
const express = require('express');
const { listCategories } = require('../services/categories');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// GET /api/categories?lang=hi&city=Pune&withSynonyms=1
// Public. Active job categories grouped for display, names in `lang`
// (English when unsupported), minus any disabled for `city`.
// ────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await listCategories({
      lang: req.query.lang,
      city: req.query.city,
      withSynonyms: req.query.withSynonyms === '1',
    });
    res.set('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('List categories error:', err.message);
    return res.status(500).json({ error: 'Could not load categories.' });
  }
});

module.exports = router;
```

- [ ] **Step 5: Run full suite — expect PASS**: `npm test`

- [ ] **Step 6: Commit** — `git commit -m "backend: add public GET /api/categories"`

---

### Task 5: App uses the API

**Files:**
- Create: `client-native/src/hooks/useCategories.js`
- Modify: `client-native/src/services/api.js`, `client-native/src/constants/services.js`, `client-native/src/app/(tabs)/home.js`, `client-native/src/app/create-job.js`

**Interfaces:**
- Consumes: `GET /api/categories?lang=` response from Task 4.
- Produces: `getCategories(lang) → Promise<{ lang, groups }>`; `useCategories(lang?) → { groups, bySlug: (slug) => { slug, name, icon } | null, loading, error, reload }`. Phase 3 onboarding uses `groups`.

- [ ] **Step 1: API call** — add to `services/api.js` below the auth calls:

```js
// ── Categories ──────────────────────────────────────────────────────────────

/** Job categories grouped for display — { lang, groups: [{ slug, name, icon, categories }] } */
export async function getCategories(lang = 'en') {
  const res = await api.get('/categories', { params: { lang } });
  return res.data;
}
```

- [ ] **Step 2: Fallback constants** — in `constants/services.js`, replace the header comment and `SERVICES`/`getService`/`MOST_BOOKED` with:

```js
// Offline fallback for the category catalogue (the backend owns the real
// list — see hooks/useCategories.js), plus home-screen picks and banners.
// `icon` is a MaterialCommunityIcons name.

export const FALLBACK_GROUPS = [
  {
    slug: 'home_services',
    name: 'Home services',
    icon: 'home-city',
    categories: [
      { slug: 'electrician', name: 'Electrician', icon: 'flash' },
      { slug: 'cleaning', name: 'House cleaning', icon: 'broom' },
      { slug: 'plumber', name: 'Plumber', icon: 'pipe-wrench' },
      { slug: 'carpenter', name: 'Carpenter', icon: 'hand-saw' },
      { slug: 'painter', name: 'Painter', icon: 'format-paint' },
      { slug: 'gardener', name: 'Gardener', icon: 'flower' },
    ],
  },
  {
    slug: 'more',
    name: 'More',
    icon: 'dots-grid',
    categories: [
      { slug: 'technician', name: 'Appliance technician', icon: 'tools' },
      { slug: 'caregiver', name: 'Elderly caregiver', icon: 'account-heart' },
      { slug: 'driver', name: 'Car driver', icon: 'car' },
    ],
  },
];

// Until we have booking data, "most booked" is a fixed pick.
export const MOST_BOOKED_SLUGS = ['electrician', 'cleaning', 'plumber', 'carpenter'];
```

Keep `BANNERS` unchanged (its `serviceId` values are category slugs).

- [ ] **Step 3: Hook** — `hooks/useCategories.js`

```js
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FALLBACK_GROUPS } from '../constants/services';
import { getCategories, getErrorMessage } from '../services/api';

// One fetch per language per app session; screens share the result.
const cache = new Map();

/**
 * The job-category catalogue in `lang`. Starts from the bundled fallback so
 * nothing renders empty offline, then swaps in the server list.
 */
export default function useCategories(lang = 'en') {
  const [groups, setGroups] = useState(() => cache.get(lang) ?? FALLBACK_GROUPS);
  const [loading, setLoading] = useState(!cache.has(lang));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCategories(lang);
      cache.set(lang, data.groups);
      setGroups(data.groups);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    if (cache.has(lang)) {
      setGroups(cache.get(lang));
      setLoading(false);
      return;
    }
    load();
  }, [lang, load]);

  const index = useMemo(() => {
    const map = new Map();
    for (const g of groups) for (const c of g.categories) map.set(c.slug, c);
    return map;
  }, [groups]);

  const bySlug = useCallback((slug) => index.get(slug) ?? null, [index]);

  return { groups, bySlug, loading, error, reload: load };
}
```

- [ ] **Step 4: Home** — in `home.js` replace the `BANNERS, MOST_BOOKED` import with `BANNERS, MOST_BOOKED_SLUGS`, import `useCategories`, and inside `Home()`:

```js
  const { bySlug } = useCategories(user?.preferredLanguage);
  const mostBooked = MOST_BOOKED_SLUGS.map(bySlug).filter(Boolean);
```

Render `mostBooked.map((service) => …)` using `service.slug` for `key`/`startJob`, `service.name` for the label and `accessibilityLabel`.

- [ ] **Step 5: Create job** — in `create-job.js` replace `getService` with the hook:

```js
import useCategories from '../hooks/useCategories';
import { getUser } from '../services/session';
// inside CreateJob():
  const [lang, setLang] = useState('en');
  useEffect(() => { getUser().then((u) => u?.preferredLanguage && setLang(u.preferredLanguage)); }, []);
  const { bySlug } = useCategories(lang);
  const service = serviceId ? bySlug(serviceId) : null;
```

and render `service.name` instead of `service.label` (add `useEffect, useState` to the React import).

- [ ] **Step 6: Verify**

Run: `cd client-native && npx expo lint` — Expected: no errors.
Run backend seed against local Mongo: `cd backend && npm run seed:categories` — Expected: `Seeded 15 groups, 92 categories, retired 0.` (counts match the JSON).
Manual: start backend + app; home "Most booked" shows 4 tiles; set language to हिन्दी via edit profile → labels switch to Hindi after reload; stop backend and cold-start app → tiles still render from fallback.

- [ ] **Step 7: Commit** — `git commit -m "app: load job categories from the backend with offline fallback"`
