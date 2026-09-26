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

test.each([
  [{ lat: '', lng: '' }],
  [{ lat: null, lng: null }],
  [{ lat: true, lng: false }],
  [{ lat: [18], lng: [73] }],
])('PATCH /me rejects a location that only looks numeric %p', async (location) => {
  const user = await createUser();
  const res = await request(app).patch('/api/auth/me').set(authHeader(user)).send({ location });
  expect(res.status).toBe(400);
  expect(res.body.fields.location).toBeTruthy();
});

test('PATCH /me accepts numeric strings for a location', async () => {
  const user = await createUser();
  const res = await request(app)
    .patch('/api/auth/me')
    .set(authHeader(user))
    .send({ location: { lat: '18.52', lng: '73.85' } });
  expect(res.status).toBe(200);
  expect(res.body.location).toEqual({ lat: 18.52, lng: 73.85 });
});

test('PATCH /me lets an unverified user edit personal and contact details', async () => {
  const user = await createUser();
  const res = await request(app)
    .patch('/api/auth/me')
    .set(authHeader(user))
    .send({ name: 'Sita Devi', dob: '01/02/1990', gender: 'F', address: '12 MG Road, Pune', phone: '9876543210' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ name: 'Sita Devi', gender: 'F', phone: '9876543210', detailsSource: 'manual' });
});

test('PATCH /me locks the DigiLocker details once Aadhaar is verified', async () => {
  const user = await createUser({ isAadhaarVerified: true, name: 'Sita Devi', dob: '01/02/1990' });
  const res = await request(app)
    .patch('/api/auth/me')
    .set(authHeader(user))
    .send({ name: 'Someone Else', dob: '05/05/1995', gender: 'M', address: '1 New Street, Delhi' });
  expect(res.status).toBe(400);
  expect(Object.keys(res.body.fields).sort()).toEqual(['address', 'dob', 'gender', 'name']);
  const saved = await User.findById(user._id);
  expect(saved.name).toBe('Sita Devi');
  expect(saved.dob).toBe('01/02/1990');
});

test('PATCH /me still lets a verified user edit contact details', async () => {
  const user = await createUser({ isAadhaarVerified: true, name: 'Sita Devi' });
  const res = await request(app)
    .patch('/api/auth/me')
    .set(authHeader(user))
    .send({ phone: '9876543210', city: 'Pune', pincode: '411001' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ name: 'Sita Devi', phone: '9876543210', city: 'Pune', pincode: '411001' });
});
