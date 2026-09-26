# Phase 3 — Worker Role, Location & Manual Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any user can register as a worker (name, income bracket, categories) through a manual form, dismiss or later revisit a "register as worker" prompt, deregister from Profile, and have their location captured by GPS; workers see only Home, Messages and Profile tabs.

**Architecture:** Backend adds worker fields and a GeoJSON location to `User`, a `services/worker.js` validator, and `/api/worker/*` routes; `PATCH /api/auth/me` accepts a location. The app gains a `UserProvider` (shared profile state so the tab layout can react to `isWorker`), a worker-prompt modal, a location service + confirm sheet built on `expo-location`, a `/worker-onboarding` chooser and `/worker-form` screen, and a Worker section plus register/deregister controls on Profile. Every new string goes through i18n in all six languages.

**Tech Stack:** Node/Express/Mongoose + jest/supertest/mongodb-memory-server; Expo SDK 57, Expo Router, `expo-location` (native — needs a new dev build), i18next.

**Spec:** `docs/superpowers/specs/2026-09-26-worker-onboarding-agent-design.md` (§3.2, §4.1 worker rows + PATCH /me, §5.2, §5.3; federation parts are Phase 4)

## Global Constraints

- `INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l']` — defined once in `backend/services/worker.js`; mirrored in `client-native/src/constants/worker.js`.
- Categories: 1–10 slugs, each an **active** `Category`.
- `name` required on register iff `!isAadhaarVerified`; ignored when verified; when given sets `detailsSource: 'manual'`.
- Deregister keeps `worker` data (prefill on re-register) and sets `deregisteredAt`.
- Prompt shows when `!isWorker && !workerPromptDismissed`, at most once per app session; ✕ hides for the session only.
- Location stored as GeoJSON `Point` `[lng, lat]` with a 2dsphere index; users without a location must still save.
- Location auto-prompt only when the user has no location **and** permission was never asked; denied → never nag, manual entry stays available.
- New user-facing strings exist in en, hi, mr, bn, ta, te (`npm run check:i18n` passes).
- `npx expo lint` 0 errors; `cd backend && npm test` green.
- Install native modules with `npx expo install`; add the `expo-location` config plugin to `app.json`.

## Review Focus

1. Register with categories containing a retired (`isActive:false`) or unknown slug → 400 with a field error, nothing saved. Test in Task 2.
2. `PATCH /me` with `location: { lat: "abc" }`, out-of-range, or missing lng → 400 field error; `location: null` clears it. Test in Task 1.
3. Saving a user that never had a location with the 2dsphere index present → succeeds (no "Can't extract geo keys"). Test in Task 1.
4. A verified user sending `name` on register → name unchanged, no error. Test in Task 2.
5. Deregister then register again with no body fields other than required ones → form prefilled from previous `worker` data (app), backend accepts. Test (backend part) in Task 2; prefill checked manually in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/models/User.js` (modify) | Worker fields, GeoJSON location + 2dsphere index. |
| `backend/services/profile.js` (modify) | `toProfile` adds worker fields + `location {lat,lng}`; `validateProfileUpdate` handles `location`. |
| `backend/services/worker.js` (new) | `INCOME_BRACKETS`, `MAX_CATEGORIES`, `validateRegistration(user, body)`. |
| `backend/routes/worker.js` (new) | `POST /api/worker/register|deregister|dismiss-prompt`. |
| `backend/tests/helpers.js` (new) | `createUser(overrides)`, `authHeader(user)`. |
| `client-native/src/context/UserContext.js` (new) | `UserProvider`, `useUser()`. |
| `client-native/src/hooks/useProfile.js` (modify) | Thin wrapper over `useUser()` + focus refresh. |
| `client-native/src/constants/worker.js` (new) | `INCOME_BRACKETS`, `MAX_CATEGORIES`. |
| `client-native/src/services/api.js` (modify) | `registerWorker`, `deregisterWorker`, `dismissWorkerPrompt`. |
| `client-native/src/services/location.js` (new) | `detectLocation()`, `locationPermissionStatus()`. |
| `client-native/src/components/WorkerPrompt.js` (new) | Dark modal, same look as `aadhaar-verify.js`. |
| `client-native/src/components/LocationSheet.js` (new) | Detect + confirm/edit city and PIN, save. |
| `client-native/src/components/CategoryPicker.js` (new) | Grouped multi-select chips with a max. |
| `client-native/src/app/(tabs)/_layout.js` (modify) | Hide Bookings for workers; mount prompt + auto location. |
| `client-native/src/app/worker-onboarding.js`, `worker-form.js` (new) | Chooser and manual form. |
| `client-native/src/app/(tabs)/profile.js`, `home.js` (modify) | Worker section, register/deregister; header opens LocationSheet. |
| `client-native/src/components/Button.js` (modify) | `danger` variant. |
| `client-native/src/i18n/locales/*.json` (modify) | New keys. |

---

### Task 1: User model fields, profile shape, and location on PATCH /me

**Files:**
- Create: `backend/tests/helpers.js`, `backend/tests/profile.test.js`
- Modify: `backend/models/User.js`, `backend/services/profile.js`, `backend/routes/auth.js`

**Interfaces:**
- Produces: `createUser(overrides) → Promise<User>`, `authHeader(user) → { Authorization }`; `toProfile(user)` adds `isWorker`, `workerPromptDismissed`, `worker`, `location: { lat, lng } | null`, `locationUpdatedAt`.

- [ ] **Step 1: Test helpers** — `backend/tests/helpers.js`

```js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let seq = 0;
function createUser(overrides = {}) {
  seq += 1;
  return User.create({
    googleId: `g-${seq}-${Date.now()}`,
    googleEmail: `user${seq}-${Date.now()}@example.com`,
    ...overrides,
  });
}

function authHeader(user) {
  return { Authorization: `Bearer ${jwt.sign({ userId: user._id }, process.env.JWT_SECRET)}` };
}

module.exports = { createUser, authHeader };
```

- [ ] **Step 2: Write the failing tests** — `backend/tests/profile.test.js`

```js
const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const User = require('../models/User');
const { createUser, authHeader } = require('./helpers');

beforeAll(async () => {
  await db.connect();
  await User.syncIndexes();
});
afterEach(db.clear);
afterAll(db.close);

test('a user without a location saves with the 2dsphere index present', async () => {
  const user = await createUser();
  user.city = 'Pune';
  await expect(user.save()).resolves.toBeTruthy();
});

test('GET /me includes worker fields and a null location', async () => {
  const user = await createUser();
  const res = await request(app).get('/api/auth/me').set(authHeader(user));
  expect(res.body).toMatchObject({ isWorker: false, workerPromptDismissed: false, location: null });
  expect(res.body.worker).toMatchObject({ incomeBracket: null, categories: [] });
});

test('PATCH /me stores a location with city and PIN', async () => {
  const user = await createUser();
  const res = await request(app)
    .patch('/api/auth/me')
    .set(authHeader(user))
    .send({ location: { lat: 18.5204, lng: 73.8567 }, city: 'Pune', pincode: '411001' });
  expect(res.status).toBe(200);
  expect(res.body.location).toEqual({ lat: 18.5204, lng: 73.8567 });
  expect(res.body.city).toBe('Pune');
  const saved = await User.findById(user._id);
  expect(saved.location.coordinates).toEqual([73.8567, 18.5204]);
  expect(saved.locationUpdatedAt).toBeInstanceOf(Date);
});

test.each([
  [{ lat: 'abc', lng: 73 }],
  [{ lat: 91, lng: 73 }],
  [{ lat: 18 }],
  ['near pune'],
])('PATCH /me rejects a bad location %p', async (location) => {
  const user = await createUser();
  const res = await request(app).patch('/api/auth/me').set(authHeader(user)).send({ location });
  expect(res.status).toBe(400);
  expect(res.body.fields.location).toBeTruthy();
});

test('PATCH /me with location null clears it', async () => {
  const user = await createUser({ location: { type: 'Point', coordinates: [73, 18] } });
  const res = await request(app).patch('/api/auth/me').set(authHeader(user)).send({ location: null });
  expect(res.status).toBe(200);
  expect(res.body.location).toBeNull();
});
```

- [ ] **Step 3: Run — expect FAIL**: `cd backend && npm test -- profile`

- [ ] **Step 4: User model** — in `backend/models/User.js`, add before `// ── Verification status`:

```js
    // ── Location (from the phone's GPS, confirmed by the user) ─────────
    // GeoJSON so "workers near me" can use a 2dsphere query later. Left
    // unset (not an empty object) until the user shares a location.
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    locationUpdatedAt: {
      type: Date,
      default: null,
    },

    // ── Worker role ─────────────────────────────────────────────────────
    isWorker: {
      type: Boolean,
      default: false,
    },
    // Set when the user answers "I'm not a worker" — stops the prompt.
    workerPromptDismissed: {
      type: Boolean,
      default: false,
    },
    worker: {
      incomeBracket: { type: String, default: null }, // services/worker.js INCOME_BRACKETS
      categories: { type: [String], default: [] }, // Category slugs
      registeredAt: { type: Date, default: null },
      deregisteredAt: { type: Date, default: null },
      onboardedVia: { type: String, enum: ['form', 'voice', null], default: null },
    },
```

and after the schema definition, before `module.exports`: `userSchema.index({ location: '2dsphere' });`. Update the header comment's field list with `location` and `worker`.

- [ ] **Step 5: Profile service** — in `backend/services/profile.js`:

`toProfile` adds:

```js
    isWorker: user.isWorker,
    workerPromptDismissed: user.workerPromptDismissed,
    worker: {
      incomeBracket: user.worker?.incomeBracket ?? null,
      categories: user.worker?.categories ?? [],
      registeredAt: user.worker?.registeredAt ?? null,
      deregisteredAt: user.worker?.deregisteredAt ?? null,
      onboardedVia: user.worker?.onboardedVia ?? null,
    },
    location: user.location?.coordinates?.length === 2
      ? { lat: user.location.coordinates[1], lng: user.location.coordinates[0] }
      : null,
    locationUpdatedAt: user.locationUpdatedAt,
```

Add a location parser and handle it in `validateProfileUpdate` before the generic loop:

```js
// { lat, lng } from the app → GeoJSON Point, or null to clear.
function parseLocation(raw) {
  if (raw === null) return null;
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  const ok =
    raw && typeof raw === 'object' &&
    raw.lat !== undefined && raw.lng !== undefined &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!ok) throw 'Could not read your location. Please try again.';
  return { type: 'Point', coordinates: [lng, lat] };
}
```

In `validateProfileUpdate`, before `for (const [field, raw] …)`:

```js
  if (body && 'location' in body) {
    try {
      updates.location = parseLocation(body.location);
      updates.locationUpdatedAt = updates.location ? new Date() : null;
    } catch (message) {
      errors.location = message;
    }
  }
```

(the generic loop already skips `location` because it has no validator). In `routes/auth.js` PATCH `/me`, clearing needs `$unset` semantics: after `Object.assign(user, updates)`, add `if (updates.location === null) user.location = undefined;`. Update the route's doc comment body list with `location`.

- [ ] **Step 6: Run — expect PASS**: `npm test`

- [ ] **Step 7: Commit** — `git commit -m "backend: worker fields and GPS location on the user profile"`

---

### Task 2: Worker registration API

**Files:**
- Create: `backend/services/worker.js`, `backend/routes/worker.js`, `backend/tests/worker.test.js`
- Modify: `backend/app.js`

**Interfaces:**
- Consumes: `createUser`, `authHeader`, `seedCategories`, `toProfile`, `validators.name` (export it from `services/profile.js` as `validateName(v)` — throws message or returns normalised name).
- Produces: `INCOME_BRACKETS`, `MAX_CATEGORIES = 10`, `validateRegistration(user, body) → Promise<{ updates, errors }>`; routes `POST /api/worker/register` (body `{ name?, incomeBracket, categories, onboardedVia? }` → profile), `POST /api/worker/deregister` → profile, `POST /api/worker/dismiss-prompt` → profile. Errors: 400 `{ error, fields }`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/worker.test.js`

```js
const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Category = require('../models/Category');
const User = require('../models/User');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');
const { createUser, authHeader } = require('./helpers');

beforeAll(db.connect);
beforeEach(() => seedCategories(data));
afterEach(db.clear);
afterAll(db.close);

const register = (user, body) =>
  request(app).post('/api/worker/register').set(authHeader(user)).send(body);

const valid = { name: 'Ramesh Kumar', incomeBracket: '1l_2_5l', categories: ['electrician', 'plumber'] };

test('an unverified user registers with a name', async () => {
  const user = await createUser();
  const res = await register(user, valid);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ isWorker: true, name: 'Ramesh Kumar', detailsSource: 'manual' });
  expect(res.body.worker).toMatchObject({ incomeBracket: '1l_2_5l', categories: ['electrician', 'plumber'], onboardedVia: 'form' });
  expect(res.body.worker.registeredAt).toBeTruthy();
});

test('an unverified user without a name gets a field error', async () => {
  const user = await createUser();
  const res = await register(user, { ...valid, name: '' });
  expect(res.status).toBe(400);
  expect(res.body.fields.name).toBeTruthy();
  expect((await User.findById(user._id)).isWorker).toBe(false);
});

test('a verified user keeps their Aadhaar name even if one is sent', async () => {
  const user = await createUser({ name: 'Sita Devi', isAadhaarVerified: true, detailsSource: 'aadhaar' });
  const res = await register(user, { ...valid, name: 'Someone Else' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Sita Devi');
  expect(res.body.detailsSource).toBe('aadhaar');
});

test.each([
  ['unknown bracket', { incomeBracket: 'lots' }, 'incomeBracket'],
  ['no categories', { categories: [] }, 'categories'],
  ['too many categories', { categories: data.categories.slice(0, 11).map((c) => c.slug) }, 'categories'],
  ['unknown category', { categories: ['astronaut'] }, 'categories'],
  ['categories not an array', { categories: 'electrician' }, 'categories'],
])('rejects %s', async (_, patch, field) => {
  const user = await createUser();
  const res = await register(user, { ...valid, ...patch });
  expect(res.status).toBe(400);
  expect(res.body.fields[field]).toBeTruthy();
});

test('rejects a retired category', async () => {
  await Category.updateOne({ slug: 'plumber' }, { $set: { isActive: false } });
  const user = await createUser();
  const res = await register(user, valid);
  expect(res.status).toBe(400);
  expect(res.body.fields.categories).toBeTruthy();
});

test('duplicate categories are stored once', async () => {
  const user = await createUser();
  const res = await register(user, { ...valid, categories: ['plumber', 'plumber', 'electrician'] });
  expect(res.body.worker.categories).toEqual(['plumber', 'electrician']);
});

test('onboardedVia voice is recorded; anything else becomes form', async () => {
  const user = await createUser();
  const res = await register(user, { ...valid, onboardedVia: 'voice' });
  expect(res.body.worker.onboardedVia).toBe('voice');
  const other = await createUser();
  const res2 = await register(other, { ...valid, onboardedVia: 'telepathy' });
  expect(res2.body.worker.onboardedVia).toBe('form');
});

test('deregister keeps worker data and can register again', async () => {
  const user = await createUser();
  await register(user, valid);
  const off = await request(app).post('/api/worker/deregister').set(authHeader(user));
  expect(off.status).toBe(200);
  expect(off.body.isWorker).toBe(false);
  expect(off.body.worker.categories).toEqual(['electrician', 'plumber']);
  expect(off.body.worker.deregisteredAt).toBeTruthy();
  const again = await register(user, { incomeBracket: '2_5l_5l', categories: ['painter'] });
  expect(again.status).toBe(200);
  expect(again.body).toMatchObject({ isWorker: true });
  expect(again.body.worker.deregisteredAt).toBeNull();
});

test('dismiss-prompt stops the prompt', async () => {
  const user = await createUser();
  const res = await request(app).post('/api/worker/dismiss-prompt').set(authHeader(user));
  expect(res.status).toBe(200);
  expect(res.body.workerPromptDismissed).toBe(true);
});

test('worker routes require a token', async () => {
  const res = await request(app).post('/api/worker/register').send(valid);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run — expect FAIL** (404s): `npm test -- worker`

- [ ] **Step 3: Export the name validator** — in `services/profile.js` add `function validateName(v) { return validators.name(String(v).trim()); }` and export it.

- [ ] **Step 4: Worker service** — `backend/services/worker.js`

```js
/**
 * Rules for registering as a worker. Shared by the manual form and the
 * voice assistant — both submit through POST /api/worker/register.
 */
const Category = require('../models/Category');
const { validateName } = require('./profile');

// Yearly income in ₹: <1L, 1–2.5L, 2.5–5L, 5–10L, >10L.
// Mirrored in client-native/src/constants/worker.js and the AI service.
const INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l'];
const MAX_CATEGORIES = 10;

async function validateRegistration(user, body = {}) {
  const updates = {};
  const errors = {};

  if (!user.isAadhaarVerified) {
    try {
      if (!body.name || !String(body.name).trim()) throw 'Enter your full name.';
      updates.name = validateName(body.name);
    } catch (message) {
      errors.name = message;
    }
  }

  if (!INCOME_BRACKETS.includes(body.incomeBracket)) {
    errors.incomeBracket = 'Choose your yearly income.';
  }

  const slugs = Array.isArray(body.categories) ? [...new Set(body.categories.map(String))] : null;
  if (!slugs || slugs.length === 0) {
    errors.categories = 'Choose at least one kind of work.';
  } else if (slugs.length > MAX_CATEGORIES) {
    errors.categories = `Choose up to ${MAX_CATEGORIES} kinds of work.`;
  } else {
    const active = await Category.countDocuments({ slug: { $in: slugs }, isActive: true });
    if (active !== slugs.length) errors.categories = 'Some of the chosen work types are not available.';
  }

  if (Object.keys(errors).length === 0) {
    updates.categories = slugs;
    updates.incomeBracket = body.incomeBracket;
    updates.onboardedVia = body.onboardedVia === 'voice' ? 'voice' : 'form';
  }
  return { updates, errors };
}

module.exports = { INCOME_BRACKETS, MAX_CATEGORIES, validateRegistration };
```

- [ ] **Step 5: Routes** — `backend/routes/worker.js`, mounted in `app.js` as `app.use('/api/worker', workerRoutes)`:

```js
const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { toProfile } = require('../services/profile');
const { validateRegistration } = require('../services/worker');

const router = express.Router();
router.use(verifyToken);

// ────────────────────────────────────────────────────────────────────────────
// POST /api/worker/register
// Body: { name?, incomeBracket, categories: [slug], onboardedVia? }
// `name` is required until Aadhaar verification, ignored after it.
// 400 → { error, fields: { [field]: message } }
// ────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const user = req.user;
  const { updates, errors } = await validateRegistration(user, req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }
  try {
    if (updates.name) {
      user.name = updates.name;
      user.detailsSource = 'manual';
    }
    user.isWorker = true;
    user.worker.incomeBracket = updates.incomeBracket;
    user.worker.categories = updates.categories;
    user.worker.onboardedVia = updates.onboardedVia;
    user.worker.registeredAt = new Date();
    user.worker.deregisteredAt = null;
    await user.save();
    return res.status(200).json(toProfile(user));
  } catch (err) {
    console.error('Worker register error:', err.message);
    return res.status(500).json({ error: 'Could not register you as a worker.' });
  }
});

// POST /api/worker/deregister — stop being a worker; keeps data for next time.
router.post('/deregister', async (req, res) => {
  try {
    req.user.isWorker = false;
    req.user.worker.deregisteredAt = new Date();
    await req.user.save();
    return res.status(200).json(toProfile(req.user));
  } catch (err) {
    console.error('Worker deregister error:', err.message);
    return res.status(500).json({ error: 'Could not update your worker status.' });
  }
});

// POST /api/worker/dismiss-prompt — "I'm not a worker": stop asking.
router.post('/dismiss-prompt', async (req, res) => {
  try {
    req.user.workerPromptDismissed = true;
    await req.user.save();
    return res.status(200).json(toProfile(req.user));
  } catch (err) {
    console.error('Dismiss worker prompt error:', err.message);
    return res.status(500).json({ error: 'Could not save your choice.' });
  }
});

module.exports = router;
```

(A `name` that fails `validateName` in the "verified" case is never reached — verified users skip name validation.)

- [ ] **Step 6: Run — expect PASS**: `npm test`

- [ ] **Step 7: Commit** — `git commit -m "backend: worker register, deregister and dismiss-prompt API"`

---

### Task 3: Shared user state, worker tabs, and the worker prompt

**Files:**
- Create: `client-native/src/context/UserContext.js`, `client-native/src/components/WorkerPrompt.js`, `client-native/src/constants/worker.js`
- Modify: `client-native/src/app/_layout.js`, `client-native/src/hooks/useProfile.js`, `client-native/src/app/(tabs)/_layout.js`, `client-native/src/services/api.js`, `client-native/src/i18n/locales/*.json`

**Interfaces:**
- Consumes: `/api/worker/dismiss-prompt` (Task 2), `applyLanguage` (Phase 2).
- Produces: `UserProvider`, `useUser() → { user, setUser, error, refreshing, reload, refresh }`; `useProfile()` unchanged signature; `registerWorker(body)`, `deregisterWorker()`, `dismissWorkerPrompt()` in api.js; `INCOME_BRACKETS`, `MAX_CATEGORIES` constants.

- [ ] **Step 1: i18n keys first (RED)** — add to `en.json`:

```json
  "worker": {
    "promptTitle": "Do you work for a living?",
    "promptBody": "Register as a worker to get jobs near you. It takes two minutes and is free.",
    "promptRegister": "Register as a worker",
    "promptNotWorker": "I'm not a worker",
    "promptClose": "Close"
  }
```

Run `npm run check:i18n` → FAIL (`hi: missing worker.promptTitle` …). Add the same keys translated in hi, mr, bn, ta, te → PASS.

- [ ] **Step 2: Constants + API** — `src/constants/worker.js`:

```js
// Keep in sync with backend/services/worker.js.
export const INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l'];
export const MAX_CATEGORIES = 10;
```

`services/api.js`, after the categories section:

```js
// ── Worker ──────────────────────────────────────────────────────────────────

/** { name?, incomeBracket, categories, onboardedVia? } → updated profile. 400 has fields. */
export async function registerWorker(body) {
  const res = await api.post('/worker/register', body);
  return res.data;
}

export async function deregisterWorker() {
  const res = await api.post('/worker/deregister');
  return res.data;
}

export async function dismissWorkerPrompt() {
  const res = await api.post('/worker/dismiss-prompt');
  return res.data;
}
```

- [ ] **Step 3: UserContext** — `src/context/UserContext.js`

```js
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { applyLanguage } from '../i18n/language';
import { getErrorMessage, getMe, isUnauthorized } from '../services/api';
import { clearSession, getUser, saveUser } from '../services/session';

const UserContext = createContext(null);

/**
 * The signed-in user's profile, shared by every screen so a change made on
 * one (e.g. registering as a worker) shows up everywhere — including the
 * tab bar. Shows the cached copy first, then refreshes from the server.
 */
export function UserProvider({ children }) {
  const router = useRouter();
  const [user, setUserState] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const setUser = useCallback((next) => {
    setUserState(next);
    if (next) saveUser(next).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    try {
      const cached = await getUser();
      if (cached) setUserState((current) => current ?? cached);

      const fresh = await getMe();
      setUser(fresh);
      setError(null);
      // Follow a language changed on another device.
      if (fresh.preferredLanguage) await applyLanguage(fresh.preferredLanguage);
    } catch (err) {
      if (isUnauthorized(err)) {
        await clearSession();
        setUserState(null);
        router.replace('/auth');
        return;
      }
      setError(getErrorMessage(err));
    }
  }, [router, setUser]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const value = useMemo(
    () => ({ user, setUser, error, refreshing, reload, refresh }),
    [user, setUser, error, refreshing, reload, refresh]
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
```

`app/_layout.js` wraps the `Stack` in `<UserProvider>`. `hooks/useProfile.js` becomes:

```js
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import { useUser } from '../context/UserContext';

/**
 * The signed-in user's profile, refreshed every time the screen gains focus.
 * State lives in UserProvider so all screens stay in sync.
 */
export default function useProfile() {
  const { user, setUser, error, refreshing, reload, refresh } = useUser();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { user, setUser, error, refreshing, refresh, reload };
}
```

Everywhere that saves a profile returned by the API (`aadhaar-callback.js`, `edit-profile.js`) also calls `setUser(updated)` from `useUser()` so the shared state updates, in addition to the existing `saveUser`.

- [ ] **Step 4: WorkerPrompt** — `src/components/WorkerPrompt.js`: a transparent `Modal` (`animationType="fade"`), dark card using the `aadhaar-verify.js` palette (`#0d0d1a` backdrop at 0.85 opacity, card `rgba(255,255,255,0.04)` + border `rgba(255,255,255,0.09)`, radius 24, green primary `#0B7A4B`), a 🧰 emoji badge, `worker.promptTitle`, `worker.promptBody`, primary button `worker.promptRegister`, text button `worker.promptNotWorker`, and a top-right ✕ (`accessibilityLabel={t('worker.promptClose')}`). Props: `{ visible, onRegister, onNotWorker, onClose, busy }`; the "not a worker" button shows an `ActivityIndicator` while `busy`.

- [ ] **Step 5: Tabs layout** — `app/(tabs)/_layout.js`:

```js
  const { t } = useTranslation();
  const router = useRouter();
  const { user, setUser } = useUser();
  const [promptClosed, setPromptClosed] = useState(sessionFlags.workerPromptClosed);
  const [dismissing, setDismissing] = useState(false);

  const showPrompt = !!user && !user.isWorker && !user.workerPromptDismissed && !promptClosed;

  const closePrompt = useCallback(() => {
    sessionFlags.workerPromptClosed = true; // once per app session
    setPromptClosed(true);
  }, []);

  const notWorker = useCallback(async () => {
    setDismissing(true);
    try {
      setUser(await dismissWorkerPrompt());
    } catch {
      closePrompt(); // try again next launch
    } finally {
      setDismissing(false);
    }
  }, [closePrompt, setUser]);
```

with module-level `const sessionFlags = { workerPromptClosed: false };`, `useEffect(() => { reload(); }, [reload])` on mount so the provider has a user, the Bookings screen `options={{ title: t('tabs.bookings'), tabBarIcon: tabIcon('calendar'), href: user?.isWorker ? null : undefined }}`, and `<WorkerPrompt visible={showPrompt} busy={dismissing} onRegister={() => { closePrompt(); router.push('/worker-onboarding'); }} onNotWorker={notWorker} onClose={closePrompt} />` rendered after `<Tabs>` (wrap both in a fragment). `/worker-onboarding` is created in Task 5; until then the push logs a missing-route warning only.

- [ ] **Step 6: Verify** — `npm run check:i18n` PASS, `npx expo lint` 0 errors, `npx expo export --platform android --output-dir <scratch>` bundles.

- [ ] **Step 7: Commit** — `git commit -m "app: shared user state, worker tabs and register-as-worker prompt"`

---

### Task 4: GPS location with confirm sheet

**Files:**
- Create: `client-native/src/services/location.js`, `client-native/src/components/LocationSheet.js`
- Modify: `client-native/app.json`, `client-native/package.json`, `client-native/src/app/(tabs)/_layout.js`, `client-native/src/app/(tabs)/home.js`, `client-native/src/i18n/locales/*.json`

**Interfaces:**
- Consumes: `updateMe` (PATCH /me with `location`, Task 1), `useUser`.
- Produces: `detectLocation() → Promise<{ lat, lng, city, pincode, area }>` throwing `LocationError` with `code ∈ 'denied' | 'services_off' | 'unavailable'`; `locationPermissionStatus() → Promise<'granted'|'denied'|'undetermined'>`; `<LocationSheet visible autoDetect onClose onSaved />`.

- [ ] **Step 1: Install** — `npx expo install expo-location`; add to `app.json` plugins:

```json
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "SIH Connect uses your location to show jobs and workers near you."
        }
      ]
```

- [ ] **Step 2: i18n keys (RED → GREEN)** — add to `en.json`, then all five languages:

```json
  "location": {
    "title": "Your location",
    "detecting": "Finding your location…",
    "useCurrent": "Use my current location",
    "confirm": "Is this right? You can correct the city and PIN code.",
    "save": "Save location",
    "denied": "Location permission is off. You can type your city and PIN code instead.",
    "servicesOff": "Turn on location (GPS) on your phone, or type your city and PIN code.",
    "unavailable": "We couldn't find your location. Please type your city and PIN code.",
    "saveFailed": "Could not save your location."
  }
```

- [ ] **Step 3: Location service** — `src/services/location.js`

```js
import * as Location from 'expo-location';

export class LocationError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'denied' | 'services_off' | 'unavailable'
  }
}

export async function locationPermissionStatus() {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/**
 * Asks for permission if needed, reads the phone's position and turns it
 * into a city + PIN with the phone's own geocoder (free, no API key).
 */
export async function detectLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationError('denied');
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationError('services_off');

  let position;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    position = await Location.getLastKnownPositionAsync();
  }
  if (!position) throw new LocationError('unavailable');

  const { latitude: lat, longitude: lng } = position.coords;
  let place = {};
  try {
    [place = {}] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  } catch {
    // Geocoder unavailable — the user types city/PIN on the confirm sheet.
  }
  return {
    lat,
    lng,
    city: place.city || place.subregion || place.district || '',
    pincode: /^[1-9]\d{5}$/.test(place.postalCode || '') ? place.postalCode : '',
    area: place.district || place.name || '',
  };
}
```

- [ ] **Step 4: LocationSheet** — `src/components/LocationSheet.js`: bottom-sheet `Modal` (same shell as `LanguageSheet`). State `{ phase: 'idle'|'detecting'|'confirm', coords, city, pincode, message, saving, errors }`. When `visible && autoDetect` it runs detection once on open. UI: title `location.title`; while detecting an `ActivityIndicator` + `location.detecting`; a `Button` (secondary) `location.useCurrent` that runs detection; on success `📍 {area}` line + `location.confirm` hint; on `LocationError` the matching message (`denied`/`servicesOff`/`unavailable`); always-editable `TextField`s for City and PIN (labels `profile.city`, `profile.pincode`, PIN digits only, max 6); primary `location.save` → `updateMe({ city, pincode, ...(coords ? { location: coords } : {}) })` → `setUser(updated)` → `onSaved(updated)`; field errors from `getFieldErrors` shown under the fields; other failures `Alert.alert(t('common.error'), t('location.saveFailed'))`.

- [ ] **Step 5: Triggers** — in `(tabs)/_layout.js`: when `user` is loaded, `!user.location`, and `sessionFlags.locationAsked` is false, call `locationPermissionStatus()`; if `'undetermined'` set `sessionFlags.locationAsked = true` and open `<LocationSheet autoDetect visible … />`. The worker prompt waits until the location sheet is closed (`showPrompt && !locationOpen`). In `home.js`, the header location `Pressable` opens the same sheet (`autoDetect={false}`) instead of pushing `/edit-profile`.

- [ ] **Step 6: Verify** — `npm run check:i18n`, `npx expo lint`, Android bundle export. Note in the commit body that a new dev build is required (`npx expo run:android` or `eas build --profile development`).

- [ ] **Step 7: Commit** — `git commit -m "app: detect location with GPS and confirm city/PIN"`

---

### Task 5: Worker onboarding chooser and manual form

**Files:**
- Create: `client-native/src/app/worker-onboarding.js`, `client-native/src/app/worker-form.js`, `client-native/src/components/CategoryPicker.js`
- Modify: `client-native/src/i18n/locales/*.json`

**Interfaces:**
- Consumes: `registerWorker`, `getFieldErrors`, `useUser`, `useCategories(i18n.language)`, `INCOME_BRACKETS`, `MAX_CATEGORIES`.
- Produces: routes `/worker-onboarding`, `/worker-form`; `<CategoryPicker groups selected onChange max error />`. Phase 4 adds a federation step to `worker-form.js`; Phase 6 enables the voice card.

- [ ] **Step 1: i18n keys (RED → GREEN)** — `en.json` additions (then all five languages):

```json
  "onboarding": {
    "title": "Register as a worker",
    "intro": "Tell us a little about your work. You can change it any time.",
    "voiceTitle": "Talk to the assistant",
    "voiceBody": "Answer a few questions by speaking.",
    "comingSoon": "Coming soon",
    "formTitle": "Fill the form",
    "formBody": "Choose your answers on screen.",
    "nameLabel": "Your name",
    "nameFromAadhaar": "From Aadhaar",
    "incomeLabel": "Yearly income",
    "categoriesLabel": "What work do you do?",
    "categoriesHint": "Choose up to {{max}}.",
    "selectedCount": "{{count}} selected",
    "submit": "Register",
    "done": "You're registered as a worker!",
    "failed": "Could not register you. Please try again."
  },
  "income": {
    "lt_1l": "Under ₹1 lakh",
    "1l_2_5l": "₹1 – 2.5 lakh",
    "2_5l_5l": "₹2.5 – 5 lakh",
    "5l_10l": "₹5 – 10 lakh",
    "gt_10l": "Over ₹10 lakh"
  }
```

- [ ] **Step 2: CategoryPicker** — grouped sections: group name (label style, uppercase muted like Profile section titles) then wrapped chips (same chip styles as `OptionGroup`, `MaterialCommunityIcons` icon at 18 before the name). Tapping toggles; when `selected.length === max` unselected chips render at 0.4 opacity and ignore taps. Header row shows `onboarding.selectedCount`. `accessibilityRole="checkbox"` with `accessibilityState={{ checked }}`.

- [ ] **Step 3: Chooser** — `app/worker-onboarding.js`: `ScreenHeader` `onboarding.title`, intro text, two cards: voice card (mic icon, `voiceTitle`, `voiceBody`, `comingSoon` badge, disabled at 0.5 opacity — constant `VOICE_ONBOARDING_ENABLED = false` at file top, Phase 6 flips it and routes to `/worker-voice`), form card (`formTitle`, `formBody`) → `router.push('/worker-form')`.

- [ ] **Step 4: Form** — `app/worker-form.js`: prefill from `user.worker` (income, categories) and `user.name`. Name: if `user.isAadhaarVerified` a read-only row with the `nameFromAadhaar` tag, else a `TextField` (`onboarding.nameLabel`, placeholder `editProfile.namePlaceholder`). Income: `OptionGroup` with `INCOME_BRACKETS.map((v) => ({ value: v, label: t(\`income.${v}\`) }))`. Categories: `CategoryPicker` with `max={MAX_CATEGORIES}`, hint `onboarding.categoriesHint`. Sticky footer `Button` `onboarding.submit` → `registerWorker({ ...(verified ? {} : { name }), incomeBracket, categories, onboardedVia: 'form' })` → `setUser(updated)` → `Alert.alert(t('onboarding.done'))` → `router.replace('/profile')`. Client-side guard: submit disabled until income and ≥1 category (and name when unverified); server field errors map to fields; other errors alert `onboarding.failed`.

- [ ] **Step 5: Verify** — `npm run check:i18n`, `npx expo lint`, Android bundle export. Manual: prompt → Register → form → submit → Profile shows worker; Bookings tab gone.

- [ ] **Step 6: Commit** — `git commit -m "app: worker onboarding chooser and manual registration form"`

---

### Task 6: Profile worker section, register/deregister

**Files:**
- Modify: `client-native/src/app/(tabs)/profile.js`, `client-native/src/components/Button.js`, `client-native/src/i18n/locales/*.json`

**Interfaces:**
- Consumes: `deregisterWorker`, `useCategories`, `INCOME_BRACKETS` labels (`income.*`).
- Produces: `Button` `variant="danger"`.

- [ ] **Step 1: i18n keys (RED → GREEN)** — `en.json` (then all five):

```json
  "workerProfile": {
    "section": "Worker",
    "categories": "Work",
    "income": "Yearly income",
    "settings": "Worker settings",
    "register": "Register as a worker",
    "deregister": "Deregister as a worker",
    "deregisterConfirmTitle": "Stop being a worker?",
    "deregisterConfirmBody": "You will stop getting jobs. Your details are kept, so you can register again any time.",
    "deregisterFailed": "Could not update your worker status."
  }
```

- [ ] **Step 2: Danger button** — in `Button.js` add styles `danger: { borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.background }`, `dangerLabel: { color: colors.danger }`, and the spinner color `colors.danger` for that variant; update the doc comment.

- [ ] **Step 3: Profile** — when `user.isWorker`, a `Section` `workerProfile.section` with rows: `workerProfile.categories` → category names joined by ", " (`bySlug` from `useCategories(i18n.language)`, unknown slugs skipped), `workerProfile.income` → `t(\`income.${bracket}\`)`. Below Preferences a `Section` `workerProfile.settings`: non-worker → `Button` (secondary) `workerProfile.register` → `router.push('/worker-onboarding')`; worker → `Button` `variant="danger"` `workerProfile.deregister` → `Alert.alert(deregisterConfirmTitle, deregisterConfirmBody, [cancel, { text: deregister, style: 'destructive', onPress: async () => setUser(await deregisterWorker()) }])`, failure alerts `deregisterFailed`.

- [ ] **Step 4: Verify** — `npm run check:i18n`, `npx expo lint`, bundle export; `cd backend && npm test`.

- [ ] **Step 5: Commit** — `git commit -m "app: worker section and register/deregister on Profile"`
