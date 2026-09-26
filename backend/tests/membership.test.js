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
