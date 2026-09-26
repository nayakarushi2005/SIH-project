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

test('deregistering also stops the register-as-worker prompt', async () => {
  const user = await createUser();
  await register(user, valid);
  const res = await request(app).post('/api/worker/deregister').set(authHeader(user));
  expect(res.body.workerPromptDismissed).toBe(true);
});

test('a database error during register is a 500, not a crash', async () => {
  const spy = jest.spyOn(Category, 'countDocuments').mockRejectedValueOnce(new Error('db down'));
  const user = await createUser();
  const res = await register(user, valid);
  expect(res.status).toBe(500);
  spy.mockRestore();
});
