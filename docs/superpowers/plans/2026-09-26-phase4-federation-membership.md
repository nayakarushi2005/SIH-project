# Phase 4 — Federation Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workers can see verified federations in their PIN code (falling back to their city), send a join request during or after onboarding, and leave or switch at any time; federations accept, reject or remove workers from a new web page; the worker's profile shows the federation status. Onboarding never waits for a federation.

**Architecture:** Federations gain `city` and `pincode`. A new `FederationMembership` collection is the single source of truth (partial unique index → at most one pending/verified membership per worker). `services/membership.js` owns matching, requesting, leaving, deciding and the profile summary; mobile routes (`verifyToken`) and web routes (`ensureAuth` + new `requireRole`) are thin. Existing federation routes get role checks (closing a hole where any logged-in account could verify federations or overwrite one by email). The mobile form gets an optional federation step and a Federations screen; the React web client gets City/PIN on registration and a Worker Requests page.

**Tech Stack:** Node/Express/Mongoose + jest/supertest/mongodb-memory-server; Expo SDK 57 app; React 19 + Vite + Tailwind 4 web client (`client/`).

**Spec:** `docs/superpowers/specs/2026-09-26-worker-onboarding-agent-design.md` (§3.3, §3.4, §4.1 federation rows, §4.2, §5.3 federation parts, §6)

## Global Constraints

- Matching: verified federations whose `pincode` equals the worker's; if none, verified federations in the same city (case-insensitive, trimmed). Unverified/rejected federations are never shown or requestable.
- One active (pending or verified) membership per worker; statuses `pending | verified | rejected | left | removed`.
- Only workers (`isWorker`) can request; the target must be in the worker's nearby set.
- Deregistering as a worker leaves any active membership (`left`).
- Federation web actions require `userModel === 'Federation'` **and** the federation's own `status === 'verified'`; they only touch memberships of that federation.
- `PATCH /api/federation/:id/verify` requires `userModel === 'GovOfficial'`; `GET /api/federation/all` too. `POST /api/federation/register` requires `Federation` and updates the caller's own record (not one looked up by body email).
- Profile (`toProfile` output from every mobile route) includes `federation: { id, name, status } | null` — the latest membership that is not `left`.
- New app strings in all 6 languages (`npm run check:i18n`). Web strings stay English (the portal is English-only today).

## Review Focus

1. Worker with no PIN and no city calls nearby → 400 with a clear message (not an empty list that looks like "no federations"). Test in Task 2.
2. Two concurrent join requests from the same worker → exactly one succeeds (unique index), the other gets 409, not 500. Test in Task 2.
3. A federation tries to accept a membership belonging to another federation, or one that is no longer pending → 404/409, nothing changes. Test in Task 3.
4. A federation whose own status is `unverified` or `rejected` calls the requests endpoints → 403. Test in Task 3.
5. A mobile user token (no `userModel`) used against web federation routes → 403. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/models/Federation.js` (modify) | `city`, `pincode`, index. |
| `backend/models/FederationMembership.js` (new) | Membership schema + partial unique index. |
| `backend/services/membership.js` (new) | `findNearby`, `requestMembership`, `leaveMembership`, `currentMembership`, `buildProfile`, `listRequests`, `decideRequest`, `removeMember`, `memberCount`. |
| `backend/middleware/requireRole.js` (new) | `requireRole(model)`. |
| `backend/routes/federations.js` (new) | Mobile `GET /api/federations/nearby`. |
| `backend/routes/worker.js` (modify) | `POST/DELETE /api/worker/federation`; deregister leaves; responses via `buildProfile`. |
| `backend/routes/auth.js` (modify) | `/me` responses via `buildProfile`. |
| `backend/routes/federation.js`, `controllers/federationController.js` (modify) | Role checks, register fix, city/PIN, `/me/requests`, `/me/members`, member counts. |
| `backend/tests/membership.test.js`, `backend/tests/federationWeb.test.js` (new) | Tests. |
| `client-native/src/services/api.js` (modify) | `getNearbyFederations`, `requestFederation`, `leaveFederation`. |
| `client-native/src/components/FederationList.js` (new) | Nearby list with status + action. |
| `client-native/src/app/federations.js` (new) | Manage federation screen. |
| `client-native/src/app/worker-form.js`, `(tabs)/profile.js` (modify) | Optional step; status row. |
| `client/src/pages/federation/FederationRegister.jsx` (modify) | City + PIN inputs. |
| `client/src/pages/federation/WorkerRequests.jsx` (new) | Pending / Members tabs. |
| `client/src/App.jsx`, `components/Navbar.jsx`, `pages/federation/FederationStatus.jsx` (modify) | Route, links, member count. |

---

### Task 1: Models and role middleware

**Files:**
- Create: `backend/models/FederationMembership.js`, `backend/middleware/requireRole.js`, `backend/tests/membershipModel.test.js`
- Modify: `backend/models/Federation.js`

**Interfaces:**
- Produces: `FederationMembership` model; `requireRole('Federation' | 'GovOfficial')` Express middleware (403 `{ message }` when `req.user?.userModel` differs); `MEMBERSHIP_STATUSES`, `ACTIVE_STATUSES = ['pending','verified']`.

- [ ] **Step 1: Failing test** — `backend/tests/membershipModel.test.js`

```js
const mongoose = require('mongoose');
const db = require('./setup');
const FederationMembership = require('../models/FederationMembership');
const requireRole = require('../middleware/requireRole');

beforeAll(async () => {
  await db.connect();
  await FederationMembership.syncIndexes();
});
afterEach(db.clear);
afterAll(db.close);

const ids = () => ({ user: new mongoose.Types.ObjectId(), federation: new mongoose.Types.ObjectId() });

test('a worker cannot hold two active memberships', async () => {
  const { user, federation } = ids();
  await FederationMembership.create({ user, federation, status: 'pending' });
  await expect(
    FederationMembership.create({ user, federation: new mongoose.Types.ObjectId(), status: 'verified' })
  ).rejects.toMatchObject({ code: 11000 });
});

test('past memberships do not block a new request', async () => {
  const { user, federation } = ids();
  await FederationMembership.create({ user, federation, status: 'left' });
  await FederationMembership.create({ user, federation, status: 'rejected' });
  await expect(FederationMembership.create({ user, federation, status: 'pending' })).resolves.toBeTruthy();
});

test('requireRole lets the right model through and blocks others', () => {
  const next = jest.fn();
  const res = { status: jest.fn(() => res), json: jest.fn() };
  requireRole('Federation')({ user: { userModel: 'Federation' } }, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  requireRole('Federation')({ user: { userId: 'x' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run — FAIL**: `cd backend && npm test -- membershipModel`

- [ ] **Step 3: Implement**

`backend/models/FederationMembership.js`:

```js
const mongoose = require('mongoose');

const MEMBERSHIP_STATUSES = ['pending', 'verified', 'rejected', 'left', 'removed'];
const ACTIVE_STATUSES = ['pending', 'verified'];

/**
 * A worker's request to join a federation, and what became of it. A worker
 * has at most one pending-or-verified membership; finished ones (rejected,
 * left, removed) stay as history.
 */
const membershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    federation: { type: mongoose.Schema.Types.ObjectId, ref: 'Federation', required: true, index: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

membershipSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } }
);

module.exports = mongoose.model('FederationMembership', membershipSchema);
module.exports.MEMBERSHIP_STATUSES = MEMBERSHIP_STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
```

`backend/middleware/requireRole.js`:

```js
/**
 * Web-portal role gate, used after ensureAuth. `model` is the token's
 * userModel: 'Federation' or 'GovOfficial'. App (worker) tokens carry no
 * userModel, so they never pass.
 */
function requireRole(model) {
  return function roleGate(req, res, next) {
    if (req.user?.userModel !== model) {
      return res.status(403).json({ message: 'You do not have access to this action.' });
    }
    return next();
  };
}

module.exports = requireRole;
```

`backend/models/Federation.js`, after `area`:

```js
    // Where the federation works. Workers see federations with their PIN,
    // or in their city when none share it.
    city: {
      type: String,
      default: '',
      trim: true,
    },
    pincode: {
      type: String, // 6-digit Indian PIN code
      default: '',
      trim: true,
    },
```

and before `module.exports`: `federationSchema.index({ status: 1, pincode: 1 });`

- [ ] **Step 4: Run — PASS**: `npm test`
- [ ] **Step 5: Commit** — `git commit -m "backend: federation membership model, city/PIN, role middleware"`

---

### Task 2: Membership service and mobile endpoints

**Files:**
- Create: `backend/services/membership.js`, `backend/routes/federations.js`, `backend/tests/membership.test.js`
- Modify: `backend/routes/worker.js`, `backend/routes/auth.js`, `backend/app.js`

**Interfaces:**
- Consumes: models (Task 1), `toProfile`, `createUser`, `authHeader`.
- Produces:
  - `findNearby(user) → Promise<{ match: 'pincode'|'city', federations: [{ id, name, city, pincode, memberCount, match, myStatus }] }>`; throws `MembershipError('no_location')`.
  - `requestMembership(user, federationId)`, `leaveMembership(user) → Promise<void>`; `currentMembership(userId) → Promise<{ id, name, status } | null>`; `buildProfile(user) → Promise<object>` (toProfile + `federation`).
  - `MembershipError(code, httpStatus)` with codes `no_location` 400, `not_worker` 403, `not_nearby` 404, `already_member` 409, `not_member` 404, `not_found` 404, `not_pending` 409, `federation_unverified` 403.
  - Routes: `GET /api/federations/nearby`, `POST /api/worker/federation { federationId }` → profile, `DELETE /api/worker/federation` → profile. Errors → `{ error, code }`.

- [ ] **Step 1: Failing tests** — `backend/tests/membership.test.js`

```js
const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Federation = require('../models/Federation');
const FederationMembership = require('../models/FederationMembership');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');
const { createUser, authHeader } = require('./helpers');

beforeAll(async () => {
  await db.connect();
  await FederationMembership.syncIndexes();
});
beforeEach(() => seedCategories(data));
afterEach(db.clear);
afterAll(db.close);

let n = 0;
const fed = (over = {}) => {
  n += 1;
  return Federation.create({ fedId: `FED-${n}`, name: `Fed ${n}`, email: `f${n}@x.org`, status: 'verified', city: 'Pune', pincode: '411001', ...over });
};
const worker = (over = {}) =>
  createUser({ name: 'Ravi', isWorker: true, city: 'Pune', pincode: '411001', ...over });

test('nearby lists verified federations with the same PIN first-class', async () => {
  const a = await fed();
  await fed({ status: 'unverified' });
  await fed({ pincode: '411038' }); // same city, other PIN
  const w = await worker();
  const res = await request(app).get('/api/federations/nearby').set(authHeader(w));
  expect(res.status).toBe(200);
  expect(res.body.match).toBe('pincode');
  expect(res.body.federations.map((f) => f.id)).toEqual([String(a._id)]);
  expect(res.body.federations[0]).toMatchObject({ match: 'pincode', myStatus: null, memberCount: 0 });
});

test('nearby falls back to the city, case-insensitively', async () => {
  const b = await fed({ pincode: '411038', city: '  pune ' });
  const w = await worker({ pincode: '411099', city: 'PUNE' });
  const res = await request(app).get('/api/federations/nearby').set(authHeader(w));
  expect(res.body.match).toBe('city');
  expect(res.body.federations.map((f) => f.id)).toEqual([String(b._id)]);
});

test('nearby without PIN or city is a 400', async () => {
  const w = await worker({ pincode: null, city: null });
  const res = await request(app).get('/api/federations/nearby').set(authHeader(w));
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('no_location');
});

test('a worker requests, sees pending on profile and in nearby', async () => {
  const a = await fed();
  const w = await worker();
  const res = await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(a._id) });
  expect(res.status).toBe(200);
  expect(res.body.federation).toEqual({ id: String(a._id), name: a.name, status: 'pending' });
  const near = await request(app).get('/api/federations/nearby').set(authHeader(w));
  expect(near.body.federations[0].myStatus).toBe('pending');
});

test('non-workers cannot request', async () => {
  const a = await fed();
  const u = await worker({ isWorker: false });
  const res = await request(app).post('/api/worker/federation').set(authHeader(u)).send({ federationId: String(a._id) });
  expect(res.status).toBe(403);
});

test.each([
  ['unverified', { status: 'unverified' }],
  ['far away', { pincode: '110001', city: 'Delhi' }],
])('cannot request a federation that is %s', async (_, over) => {
  const f = await fed(over);
  const w = await worker();
  const res = await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(f._id) });
  expect(res.status).toBe(404);
});

test('a bad federation id is a 404, not a 500', async () => {
  const w = await worker();
  const res = await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: 'nope' });
  expect(res.status).toBe(404);
});

test('a second active request is a 409, even when sent at the same time', async () => {
  const a = await fed();
  const b = await fed();
  const w = await worker();
  const send = (f) => request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(f._id) });
  const results = await Promise.all([send(a), send(b)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
});

test('leave then request another federation', async () => {
  const a = await fed();
  const b = await fed();
  const w = await worker();
  await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(a._id) });
  const left = await request(app).delete('/api/worker/federation').set(authHeader(w));
  expect(left.status).toBe(200);
  expect(left.body.federation).toBeNull();
  const again = await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(b._id) });
  expect(again.body.federation.id).toBe(String(b._id));
});

test('leave with nothing to leave is a 404', async () => {
  const w = await worker();
  const res = await request(app).delete('/api/worker/federation').set(authHeader(w));
  expect(res.status).toBe(404);
});

test('deregistering as a worker leaves the federation', async () => {
  const a = await fed();
  const w = await worker();
  await request(app).post('/api/worker/federation').set(authHeader(w)).send({ federationId: String(a._id) });
  const res = await request(app).post('/api/worker/deregister').set(authHeader(w));
  expect(res.body.federation).toBeNull();
  expect(await FederationMembership.countDocuments({ status: 'left' })).toBe(1);
});

test('GET /me carries the federation summary; a rejection stays visible', async () => {
  const a = await fed();
  const w = await worker();
  await FederationMembership.create({ user: w._id, federation: a._id, status: 'rejected', rejectionReason: 'Not local' });
  const res = await request(app).get('/api/auth/me').set(authHeader(w));
  expect(res.body.federation).toEqual({ id: String(a._id), name: a.name, status: 'rejected' });
});
```

- [ ] **Step 2: Run — FAIL**: `npm test -- membership.test`

- [ ] **Step 3: Service** — `backend/services/membership.js`

```js
/**
 * Workers joining federations. Everything that reads or changes a
 * FederationMembership goes through here so the rules live in one place:
 * only verified federations, only nearby ones, one active membership.
 */
const mongoose = require('mongoose');
const Federation = require('../models/Federation');
const FederationMembership = require('../models/FederationMembership');
const User = require('../models/User');
const { ACTIVE_STATUSES } = require('../models/FederationMembership');
const { toProfile } = require('./profile');

class MembershipError extends Error {
  constructor(code, httpStatus, message) {
    super(message || code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const MESSAGES = {
  no_location: 'Add your city or PIN code to see federations near you.',
  not_worker: 'Register as a worker first.',
  not_nearby: 'That federation is not available in your area.',
  already_member: 'You already have a federation request. Leave it first to join another.',
  not_member: 'You are not part of a federation.',
  not_found: 'That request was not found.',
  not_pending: 'That request has already been handled.',
  federation_unverified: 'Your federation must be verified by the government first.',
};

function fail(code, httpStatus) {
  throw new MembershipError(code, httpStatus, MESSAGES[code]);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

async function memberCounts(federationIds) {
  const rows = await FederationMembership.aggregate([
    { $match: { federation: { $in: federationIds }, status: 'verified' } },
    { $group: { _id: '$federation', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function memberCount(federationId) {
  return FederationMembership.countDocuments({ federation: federationId, status: 'verified' });
}

/** Verified federations for this worker: same PIN, else same city. */
async function nearbyFederations(user) {
  const pincode = (user.pincode || '').trim();
  const city = (user.city || '').trim();
  if (!pincode && !city) fail('no_location', 400);

  let match = 'pincode';
  let feds = pincode ? await Federation.find({ status: 'verified', pincode }).sort({ name: 1 }).lean() : [];
  if (feds.length === 0 && city) {
    match = 'city';
    feds = await Federation.find({
      status: 'verified',
      city: { $regex: `^\\s*${escapeRegex(city)}\\s*$`, $options: 'i' },
    })
      .sort({ name: 1 })
      .lean();
  }
  return { match, feds };
}

async function findNearby(user) {
  const { match, feds } = await nearbyFederations(user);
  const ids = feds.map((f) => f._id);
  const [counts, mine] = await Promise.all([
    memberCounts(ids),
    FederationMembership.find({ user: user._id, federation: { $in: ids } }).sort({ createdAt: -1 }).lean(),
  ]);
  const latest = new Map();
  for (const m of mine) if (!latest.has(String(m.federation))) latest.set(String(m.federation), m.status);
  return {
    match,
    federations: feds.map((f) => {
      const status = latest.get(String(f._id));
      return {
        id: String(f._id),
        name: f.name,
        city: f.city,
        pincode: f.pincode,
        memberCount: counts.get(String(f._id)) || 0,
        match,
        myStatus: status && status !== 'left' ? status : null,
      };
    }),
  };
}

async function requestMembership(user, federationId) {
  if (!user.isWorker) fail('not_worker', 403);
  if (!isId(federationId)) fail('not_nearby', 404);
  const { feds } = await nearbyFederations(user);
  if (!feds.some((f) => String(f._id) === String(federationId))) fail('not_nearby', 404);
  try {
    await FederationMembership.create({ user: user._id, federation: federationId, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) fail('already_member', 409);
    throw err;
  }
}

async function leaveMembership(user, { quiet = false } = {}) {
  const res = await FederationMembership.updateMany(
    { user: user._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'left', decidedAt: new Date() } }
  );
  if (res.modifiedCount === 0 && !quiet) fail('not_member', 404);
}

/** Latest membership that the worker did not leave — shown on the profile. */
async function currentMembership(userId) {
  const m = await FederationMembership.findOne({ user: userId, status: { $ne: 'left' } })
    .sort({ createdAt: -1 })
    .populate('federation', 'name')
    .lean();
  if (!m || !m.federation) return null;
  return { id: String(m.federation._id), name: m.federation.name, status: m.status };
}

async function buildProfile(user) {
  return { ...toProfile(user), federation: await currentMembership(user._id) };
}

// ── Federation side (web portal) ────────────────────────────────────────────

async function loadVerifiedFederation(federationId) {
  const federation = await Federation.findById(federationId).lean();
  if (!federation || federation.status !== 'verified') fail('federation_unverified', 403);
  return federation;
}

async function listRequests(federationId, status = 'pending') {
  await loadVerifiedFederation(federationId);
  const wanted = status === 'verified' ? 'verified' : 'pending';
  const rows = await FederationMembership.find({ federation: federationId, status: wanted })
    .sort({ requestedAt: 1 })
    .lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.user) } })
    .select('name isAadhaarVerified worker.categories city pincode')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => {
    const u = byId.get(String(r.user)) || {};
    return {
      id: String(r._id),
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      worker: {
        name: u.name || null,
        isAadhaarVerified: !!u.isAadhaarVerified,
        categories: u.worker?.categories || [],
        city: u.city || null,
        pincode: u.pincode || null,
      },
    };
  });
}

async function decideRequest(federationId, membershipId, action, reason) {
  await loadVerifiedFederation(federationId);
  if (!isId(membershipId)) fail('not_found', 404);
  const m = await FederationMembership.findOne({ _id: membershipId, federation: federationId });
  if (!m) fail('not_found', 404);
  if (m.status !== 'pending') fail('not_pending', 409);
  m.status = action === 'accept' ? 'verified' : 'rejected';
  m.decidedAt = new Date();
  m.rejectionReason = action === 'reject' ? (String(reason || '').trim().slice(0, 300) || null) : null;
  await m.save();
  return { id: String(m._id), status: m.status };
}

async function removeMember(federationId, membershipId) {
  await loadVerifiedFederation(federationId);
  if (!isId(membershipId)) fail('not_found', 404);
  const m = await FederationMembership.findOne({ _id: membershipId, federation: federationId });
  if (!m) fail('not_found', 404);
  if (m.status !== 'verified') fail('not_pending', 409);
  m.status = 'removed';
  m.decidedAt = new Date();
  await m.save();
  return { id: String(m._id), status: m.status };
}

/** Express helper: turn a MembershipError into a JSON response. */
function sendMembershipError(res, err, key = 'error') {
  if (err instanceof MembershipError) {
    return res.status(err.httpStatus).json({ [key]: err.message, code: err.code });
  }
  console.error('Membership error:', err.message);
  return res.status(500).json({ [key]: 'Something went wrong. Please try again.' });
}

module.exports = {
  MembershipError,
  buildProfile,
  currentMembership,
  decideRequest,
  findNearby,
  leaveMembership,
  listRequests,
  memberCount,
  removeMember,
  requestMembership,
  sendMembershipError,
};
```

- [ ] **Step 4: Routes**

`backend/routes/federations.js` (mounted `app.use('/api/federations', federationsRoutes)`):

```js
const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { findNearby, sendMembershipError } = require('../services/membership');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// GET /api/federations/nearby  (app)
// Verified federations with the worker's PIN code, else in their city.
// → { match: 'pincode'|'city', federations: [{ id, name, city, pincode,
//     memberCount, match, myStatus }] }
// ────────────────────────────────────────────────────────────────────────────
router.get('/nearby', verifyToken, async (req, res) => {
  try {
    return res.status(200).json(await findNearby(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});

module.exports = router;
```

In `backend/routes/worker.js`: import `{ buildProfile, leaveMembership, requestMembership, sendMembershipError }`; every `res.status(200).json(toProfile(...))` becomes `res.status(200).json(await buildProfile(...))`; deregister calls `await leaveMembership(req.user, { quiet: true })` before saving; add:

```js
// POST /api/worker/federation { federationId } — ask to join a nearby federation.
router.post('/federation', async (req, res) => {
  try {
    await requestMembership(req.user, req.body?.federationId);
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});

// DELETE /api/worker/federation — cancel a pending request or leave.
router.delete('/federation', async (req, res) => {
  try {
    await leaveMembership(req.user);
    return res.status(200).json(await buildProfile(req.user));
  } catch (err) {
    return sendMembershipError(res, err);
  }
});
```

In `backend/routes/auth.js`, `GET /me`, `PATCH /me` and `/aadhaar/verify` respond with `await buildProfile(user)` (the Google login response keeps `toProfile` — the app refreshes `/me` right after).

- [ ] **Step 5: Run — PASS**: `npm test`
- [ ] **Step 6: Commit** — `git commit -m "backend: nearby federations and worker join/leave requests"`

---

### Task 3: Federation web endpoints and role fixes

**Files:**
- Create: `backend/tests/federationWeb.test.js`
- Modify: `backend/routes/federation.js`, `backend/controllers/federationController.js`

**Interfaces:**
- Consumes: `requireRole`, `listRequests`, `decideRequest`, `removeMember`, `memberCount`, `sendMembershipError`.
- Produces: `GET /api/federation/me/requests?status=pending|verified` → `{ requests: [...] }`; `PATCH /api/federation/me/requests/:id { action, reason? }` → `{ request }`; `DELETE /api/federation/me/members/:id` → `{ request }`; `register` requires `city` (2–60 chars) and `pincode` (6 digits) and updates the caller's record; `check-email` and `:id` responses add `memberCount`.

- [ ] **Step 1: Failing tests** — `backend/tests/federationWeb.test.js`

```js
const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Federation = require('../models/Federation');
const FederationMembership = require('../models/FederationMembership');
const { generateAccessToken } = require('../utils/tokenUtils');
const { createUser, authHeader } = require('./helpers');

beforeAll(async () => {
  await db.connect();
  await FederationMembership.syncIndexes();
});
afterEach(db.clear);
afterAll(db.close);

let n = 0;
const fed = (over = {}) => {
  n += 1;
  return Federation.create({ fedId: `FED-${n}`, name: `Fed ${n}`, email: `f${n}@x.org`, status: 'verified', city: 'Pune', pincode: '411001', ...over });
};
const as = (doc, model) => ({ Authorization: `Bearer ${generateAccessToken(doc._id, model)}` });

async function pendingRequest(f) {
  const w = await createUser({ name: 'Asha', isWorker: true, isAadhaarVerified: true, worker: { categories: ['cook'] } });
  return FederationMembership.create({ user: w._id, federation: f._id, status: 'pending' });
}

test('a verified federation lists its pending requests with worker details', async () => {
  const f = await fed();
  await pendingRequest(f);
  const res = await request(app).get('/api/federation/me/requests').set(as(f, 'Federation'));
  expect(res.status).toBe(200);
  expect(res.body.requests).toHaveLength(1);
  expect(res.body.requests[0].worker).toMatchObject({ name: 'Asha', isAadhaarVerified: true, categories: ['cook'] });
});

test('accept moves a request to members; reject stores the reason', async () => {
  const f = await fed();
  const m1 = await pendingRequest(f);
  const m2 = await pendingRequest(f);
  const ok = await request(app).patch(`/api/federation/me/requests/${m1._id}`).set(as(f, 'Federation')).send({ action: 'accept' });
  expect(ok.body.request.status).toBe('verified');
  const no = await request(app).patch(`/api/federation/me/requests/${m2._id}`).set(as(f, 'Federation')).send({ action: 'reject', reason: 'Outside our area' });
  expect(no.body.request.status).toBe('rejected');
  expect((await FederationMembership.findById(m2._id)).rejectionReason).toBe('Outside our area');
  const members = await request(app).get('/api/federation/me/requests?status=verified').set(as(f, 'Federation'));
  expect(members.body.requests.map((r) => r.id)).toEqual([String(m1._id)]);
});

test('an unknown action is a 400', async () => {
  const f = await fed();
  const m = await pendingRequest(f);
  const res = await request(app).patch(`/api/federation/me/requests/${m._id}`).set(as(f, 'Federation')).send({ action: 'maybe' });
  expect(res.status).toBe(400);
});

test("cannot touch another federation's request, or decide twice", async () => {
  const f = await fed();
  const other = await fed();
  const m = await pendingRequest(other);
  const res = await request(app).patch(`/api/federation/me/requests/${m._id}`).set(as(f, 'Federation')).send({ action: 'accept' });
  expect(res.status).toBe(404);
  await request(app).patch(`/api/federation/me/requests/${m._id}`).set(as(other, 'Federation')).send({ action: 'accept' });
  const twice = await request(app).patch(`/api/federation/me/requests/${m._id}`).set(as(other, 'Federation')).send({ action: 'reject' });
  expect(twice.status).toBe(409);
});

test('remove a member', async () => {
  const f = await fed();
  const m = await pendingRequest(f);
  await request(app).patch(`/api/federation/me/requests/${m._id}`).set(as(f, 'Federation')).send({ action: 'accept' });
  const res = await request(app).delete(`/api/federation/me/members/${m._id}`).set(as(f, 'Federation'));
  expect(res.body.request.status).toBe('removed');
});

test.each(['unverified', 'rejected'])('a %s federation gets 403', async (status) => {
  const f = await fed({ status });
  const res = await request(app).get('/api/federation/me/requests').set(as(f, 'Federation'));
  expect(res.status).toBe(403);
});

test('app and gov tokens cannot use federation request routes', async () => {
  const user = await createUser();
  const app1 = await request(app).get('/api/federation/me/requests').set(authHeader(user));
  expect(app1.status).toBe(403);
  const gov = await request(app).get('/api/federation/me/requests').set(as({ _id: user._id }, 'GovOfficial'));
  expect(gov.status).toBe(403);
});

test('only a government official can verify a federation', async () => {
  const f = await fed({ status: 'unverified' });
  const self = await request(app).patch(`/api/federation/${f._id}/verify`).set(as(f, 'Federation')).send({ status: 'verified' });
  expect(self.status).toBe(403);
  const gov = await request(app).patch(`/api/federation/${f._id}/verify`).set(as({ _id: f._id }, 'GovOfficial')).send({ status: 'verified' });
  expect(gov.status).toBe(200);
});

test('register updates the caller only and requires city and PIN', async () => {
  const mine = await fed({ status: 'unverified', city: '', pincode: '' });
  const victim = await fed({ status: 'unverified' });
  const bad = await request(app).post('/api/federation/register').set(as(mine, 'Federation')).send({ name: 'Mine', noOfWorkers: 5, city: 'Pune', pincode: '12' });
  expect(bad.status).toBe(400);
  const ok = await request(app)
    .post('/api/federation/register')
    .set(as(mine, 'Federation'))
    .send({ name: 'Mine', email: victim.email, noOfWorkers: 5, city: 'Pune', pincode: '411001' });
  expect(ok.status).toBe(200);
  expect(ok.body.federation._id).toBe(String(mine._id));
  expect((await Federation.findById(victim._id)).name).toBe(victim.name);
});
```

- [ ] **Step 2: Run — FAIL**: `npm test -- federationWeb`

- [ ] **Step 3: Controller changes** — in `federationController.js`:
  - `registerFederation`: find `Federation.findById(req.user.userId)` (404 if missing); validate `city` trimmed 2–60 chars and `pincode` `/^[1-9]\d{5}$/` → 400 `{ message, fields }`; set `name`, `amount`, `noOfWorkers`, `area`, `city`, `pincode`; keep status `unverified` only if it is not already `verified` (re-submitting details must not un-verify a federation).
  - `checkFederationByEmail` and `getFederationById`: include `memberCount: await memberCount(federation._id)` in the JSON (as a sibling of `federation`).
  - New handlers `listMyRequests`, `decideMyRequest` (400 unless `action` is `accept|reject`), `removeMyMember` using the service with `req.user.userId`, errors via `sendMembershipError(res, err, 'message')` (the web client reads `message`).

- [ ] **Step 4: Routes** — `backend/routes/federation.js`:

```js
router.use(ensureAuth);

router.post('/register', requireRole('Federation'), registerFederation);
router.get('/check-email/:email', checkFederationByEmail);
router.get('/all', requireRole('GovOfficial'), getAllFederations);

// Federation portal: worker join requests (must come before '/:id').
router.get('/me/requests', requireRole('Federation'), listMyRequests);
router.patch('/me/requests/:id', requireRole('Federation'), decideMyRequest);
router.delete('/me/members/:id', requireRole('Federation'), removeMyMember);

router.get('/:id', getFederationById);
router.patch('/:id/verify', requireRole('GovOfficial'), verifyFederation);
```

- [ ] **Step 5: Run — PASS**: `npm test`
- [ ] **Step 6: Commit** — `git commit -m "backend: federation worker-request endpoints and role checks"`

---

### Task 4: Web portal — City/PIN and Worker Requests page

**Files:**
- Create: `client/src/pages/federation/WorkerRequests.jsx`
- Modify: `client/src/pages/federation/FederationRegister.jsx`, `client/src/pages/federation/FederationStatus.jsx`, `client/src/App.jsx`, `client/src/components/Navbar.jsx`

**Interfaces:**
- Consumes: Task 3 endpoints via `useFetchWithAuth`.

- [ ] **Step 1: Register form** — add `city` and `pincode` to `formData`, two inputs (City * with `MapPin`, PIN code * with `inputMode="numeric"`, `maxLength={6}`, `pattern="[1-9][0-9]{5}"`, digits-only onChange) in a 2-column grid after the Area field, sent in the POST body. Show `data.fields?.pincode || data.fields?.city || data.message` on 400.

- [ ] **Step 2: WorkerRequests page** — same slate/Tailwind look as `GovernmentVerification.jsx`: header ("Federation Portal" pill, title "Worker Requests", Refresh button), tab switcher `Pending (n)` / `Members (n)`, list cards. Pending card: worker name (or "Name not added"), green "Aadhaar verified" pill when true, categories as small slate chips (slugs rendered with `_` → space, capitalised), city/PIN, "Requested {date}"; buttons **Accept** (emerald) and **Reject** (rose) — Reject opens an inline textarea for an optional reason with Confirm/Cancel. Members card: same info + "Member since {decidedAt}" + **Remove** (rose outline, `window.confirm`). Actions call the endpoints, update local state optimistically on success, show an error banner on failure (`data.message`). A 403 with `code: 'federation_unverified'` shows an amber empty state: "Your federation must be verified by the government before you can accept workers."

- [ ] **Step 3: Wiring** — `App.jsx`: `<Route path="/federation/workers" element={<WorkerRequests />} />` inside `ProtectedRoute`. `Navbar.jsx`: for `userType === 'Federation'` a "Worker Requests" link (`Users` icon) to `/federation/workers`. `FederationStatus.jsx`: read `memberCount` from the check-email response, show it as "Connected workers" next to "Number of Workers", and when `status === 'verified'` a primary link button "Manage worker requests →" to `/federation/workers`.

- [ ] **Step 4: Verify** — `cd client && npm run lint && npm run build` → both succeed.
- [ ] **Step 5: Commit** — `git commit -m "web: federation city/PIN and worker requests page"`

---

### Task 5: App — federation step, Federations screen, profile status

**Files:**
- Create: `client-native/src/components/FederationList.js`, `client-native/src/app/federations.js`
- Modify: `client-native/src/services/api.js`, `client-native/src/app/worker-form.js`, `client-native/src/app/(tabs)/profile.js`, `client-native/src/i18n/locales/*.json`

**Interfaces:**
- Consumes: `GET /federations/nearby`, `POST/DELETE /worker/federation` (Task 2); `useUser`.
- Produces: `getNearbyFederations()`, `requestFederation(federationId)`, `leaveFederation()`; `<FederationList federations selectedId onSelect mode />` (`mode: 'pick'` radio list for the form, `'manage'` with per-row actions).

- [ ] **Step 1: i18n keys (RED → GREEN)** — `en.json` (then hi, mr, bn, ta, te):

```json
  "federation": {
    "stepTitle": "Join a federation (optional)",
    "stepBody": "Federations are worker cooperatives. Joining one is optional — you can register now and decide later.",
    "notNow": "Not now",
    "none": "No verified federations near you yet.",
    "noLocation": "Add your city or PIN code to see federations near you.",
    "matchPincode": "In your PIN code",
    "matchCity": "In your city",
    "members": "{{count}} members",
    "statusPending": "Request sent",
    "statusVerified": "Connected",
    "statusRejected": "Not accepted",
    "statusNone": "Not connected",
    "join": "Send request",
    "cancel": "Cancel request",
    "leave": "Leave",
    "leaveConfirm": "Leave this federation? You can join another one afterwards.",
    "manage": "Federation",
    "manageTitle": "Federations near you",
    "joinOther": "Join a federation",
    "requestFailed": "Could not send the request.",
    "leaveFailed": "Could not leave the federation."
  }
```

- [ ] **Step 2: API** — in `services/api.js`:

```js
// ── Federations ─────────────────────────────────────────────────────────────

/** { match, federations: [{ id, name, city, pincode, memberCount, match, myStatus }] } */
export async function getNearbyFederations() {
  const res = await api.get('/federations/nearby');
  return res.data;
}

/** Ask to join; returns the updated profile. */
export async function requestFederation(federationId) {
  const res = await api.post('/worker/federation', { federationId });
  return res.data;
}

/** Cancel a pending request or leave; returns the updated profile. */
export async function leaveFederation() {
  const res = await api.delete('/worker/federation');
  return res.data;
}
```

- [ ] **Step 3: FederationList** — rows with the federation name (bold), `federation.matchPincode|matchCity`, `federation.members` count, and a status pill (`statusPending` amber, `statusVerified` green, `statusRejected` muted red, nothing for null). In `pick` mode each row is a radio (`accessibilityRole="radio"`), plus a final "Not now" row with value `null`. In `manage` mode each row has one action button: no active membership anywhere → `join`; this row pending → `cancel`; this row verified → `leave` (danger); rows other than the active one are disabled while one is active.

- [ ] **Step 4: Form step** — `worker-form.js` loads `getNearbyFederations()` once on mount (promise callbacks only; `no_location` → show `federation.noLocation`; other errors → hide the step). Renders a section titled `federation.stepTitle` + `stepBody` + `FederationList mode="pick"` when the list is non-empty (else `federation.none`). On submit: `registerWorker(...)` then, if a federation was picked, `requestFederation(id)` — a failure here does not undo registration: alert `federation.requestFailed` and continue to Profile. Final `setUser` uses the last profile returned.

- [ ] **Step 5: Federations screen** — `app/federations.js`: header `federation.manageTitle`; loads nearby; `FederationList mode="manage"`; join → `requestFederation` → `setUser` → reload list; cancel/leave → confirm (`leaveConfirm`) → `leaveFederation` → `setUser` → reload; errors alert `requestFailed`/`leaveFailed` (or the server `error` text for 404/409).

- [ ] **Step 6: Profile** — in the Worker section add a pressable row `federation.manage` whose value is `user.federation ? \`${user.federation.name} · ${t(statusKey)}\` : t('federation.statusNone')` and `onPress={() => router.push('/federations')}`.

- [ ] **Step 7: Verify** — `npm run check:i18n`, `npx expo lint` (0 errors), Android bundle export; `cd backend && npm test`.
- [ ] **Step 8: Commit** — `git commit -m "app: join federations during onboarding and from Profile"`
