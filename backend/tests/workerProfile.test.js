const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const { validateWorkerProfile } = require('../services/workerProfile');
const { createUser, authHeader } = require('./helpers');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('validateWorkerProfile — coded field errors', () => {
  test('an empty skills list is coded worker_skills_required', async () => {
    const { errors } = await validateWorkerProfile({ skills: [] });
    expect(errors.skills.code).toBe('worker_skills_required');
  });

  test('too many skills is coded worker_skills_max with a max param', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `skill-${i}`);
    const { errors } = await validateWorkerProfile({ skills: many });
    expect(errors.skills.code).toBe('worker_skills_max');
    expect(typeof errors.skills.params.max).toBe('number');
  });

  test('a bio over 300 characters is coded worker_bio_length', async () => {
    const { errors } = await validateWorkerProfile({
      skills: ['plumber'],
      bio: 'x'.repeat(301),
    });
    expect(errors.bio.code).toBe('worker_bio_length');
  });

  test('a non-integer experience is coded worker_experience_invalid', async () => {
    const { errors } = await validateWorkerProfile({
      skills: ['plumber'],
      experienceYears: 'lots',
    });
    expect(errors.experienceYears.code).toBe('worker_experience_invalid');
  });

  test('a radius outside 1-25km is coded worker_radius_invalid', async () => {
    const { errors } = await validateWorkerProfile({
      skills: ['plumber'],
      serviceRadiusKm: 999,
    });
    expect(errors.serviceRadiusKm.code).toBe('worker_radius_invalid');
  });
});

describe('PUT /api/workers/me — coded validation response', () => {
  test('an empty skills list is a coded 400 with fieldCodes', async () => {
    const user = await createUser({ isWorker: true, worker: { categories: ['plumber'] } });
    const res = await request(app)
      .put('/api/workers/me')
      .set(authHeader(user))
      .send({ skills: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(typeof res.body.fields.skills).toBe('string');
    expect(res.body.fieldCodes.skills).toBe('worker_skills_required');
  });
});
