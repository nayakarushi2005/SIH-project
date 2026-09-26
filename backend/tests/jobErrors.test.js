const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const { validateNewJob } = require('../services/job');
const { splitFieldErrors } = require('../services/errors');
const { createUser, authHeader } = require('./helpers');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('validateNewJob — language / postedVia', () => {
  test('language is stored when supported', async () => {
    const user = await createUser();
    const { job } = await validateNewJob(user, { language: 'ta' });
    expect(job.language).toBe('ta');
  });

  test('language defaults to en when missing', async () => {
    const user = await createUser();
    const { job } = await validateNewJob(user, {});
    expect(job.language).toBe('en');
  });

  test('an unsupported language is a coded error', async () => {
    const user = await createUser();
    const { errors } = await validateNewJob(user, { language: 'xx' });
    expect(errors.language.code).toBe('job_language_invalid');
  });

  test('postedVia defaults to form when missing', async () => {
    const user = await createUser();
    const { job } = await validateNewJob(user, {});
    expect(job.postedVia).toBe('form');
  });

  test('postedVia is stored when voice', async () => {
    const user = await createUser();
    const { job } = await validateNewJob(user, { postedVia: 'voice' });
    expect(job.postedVia).toBe('voice');
  });
});

describe('POST /api/jobs — coded validation errors', () => {
  test('an empty body is a coded 400 with field codes', async () => {
    const user = await createUser();
    const res = await request(app).post('/api/jobs').set(authHeader(user)).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(typeof res.body.fields.price).toBe('string');
    expect(res.body.fieldCodes.price).toBe('job_price_range');
  });
});

describe('splitFieldErrors', () => {
  test('handles a legacy string error alongside a coded one', () => {
    const { fields, fieldCodes, fieldParams } = splitFieldErrors({
      legacy: 'Some message',
      coded: { code: 'job_photos_max', message: 'Add at most 5 photos.', params: { max: 5 } },
    });
    expect(fields).toEqual({ legacy: 'Some message', coded: 'Add at most 5 photos.' });
    expect(fieldCodes).toEqual({ legacy: null, coded: 'job_photos_max' });
    expect(fieldParams).toEqual({ coded: { max: 5 } });
  });
});
