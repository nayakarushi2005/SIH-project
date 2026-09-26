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
