const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const { createUser, authHeader } = require('./helpers');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

// POST /api/workers/me/location shares readLocation with /me/online — both
// route through services/job.js's toGeoPoint, which throws a coded
// fieldError since Task 1.
test('POST /api/workers/me/location rejects a bad location with a coded, string error', async () => {
  const user = await createUser();
  const res = await request(app)
    .post('/api/workers/me/location')
    .set(authHeader(user))
    .send({ location: { lat: 'abc', lng: 73 } });
  expect(res.status).toBe(400);
  expect(typeof res.body.error).toBe('string');
  expect(res.body.code).toBe('validation');
  expect(typeof res.body.fields.location).toBe('string');
  expect(res.body.fieldCodes.location).toBe('job_location_invalid');
});
