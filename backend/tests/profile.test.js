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
