const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Job = require('../models/Job');
const { createUser, authHeader } = require('./helpers');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

function makeJob(overrides = {}) {
  return Job.create({
    client: overrides.client,
    category: 'plumber',
    description: 'Fix a leaking tap in the kitchen',
    photos: ['https://example.com/photo.jpg'],
    price: 500,
    expectedDurationMins: 60,
    location: { type: 'Point', coordinates: [72.8, 19.1] },
    clientAadhaarVerified: true,
    status: 'ASSIGNED',
    startCode: '1234',
    startCodeAttempts: 0,
    ...overrides,
  });
}

describe('POST /api/jobs/:id/start — wrong code coding', () => {
  test('a wrong code with tries left is coded job_start_code_wrong with fieldCodes/fieldParams', async () => {
    const client = await createUser();
    const worker = await createUser();
    const job = await makeJob({ client: client._id, assignedWorker: worker._id, startCodeAttempts: 0 });

    const res = await request(app)
      .post(`/api/jobs/${job._id}/start`)
      .set(authHeader(worker))
      .send({ code: 'wrong' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('job_start_code_wrong');
    expect(res.body.params).toEqual({ left: 4 });
    expect(res.body.fieldCodes).toEqual({ code: 'job_start_code_wrong' });
    expect(res.body.fieldParams).toEqual({ code: { left: 4 } });
  });

  test('the last wrong code (0 left) is coded job_start_code_wrong_last with no params', async () => {
    const client = await createUser();
    const worker = await createUser();
    // 4 attempts already used — this guess is the 5th and last before lockout.
    const job = await makeJob({ client: client._id, assignedWorker: worker._id, startCodeAttempts: 4 });

    const res = await request(app)
      .post(`/api/jobs/${job._id}/start`)
      .set(authHeader(worker))
      .send({ code: 'wrong' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Wrong code.');
    expect(res.body.code).toBe('job_start_code_wrong_last');
    expect(res.body.fieldCodes).toEqual({ code: 'job_start_code_wrong_last' });
    expect(res.body.params).toBeUndefined();
    expect(res.body.fieldParams).toBeUndefined();
  });
});
