const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Category = require('../models/Category');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');

beforeAll(db.connect);
beforeEach(() => seedCategories(data));
afterEach(db.clear);
afterAll(db.close);

const allSlugs = (body) => body.groups.flatMap((g) => g.categories.map((c) => c.slug));

test('returns grouped categories in Hindi', async () => {
  const res = await request(app).get('/api/categories?lang=hi');
  expect(res.status).toBe(200);
  expect(res.body.lang).toBe('hi');
  const electrician = res.body.groups.flatMap((g) => g.categories).find((c) => c.slug === 'electrician');
  expect(electrician.name).toBe(data.categories.find((c) => c.slug === 'electrician').names.hi);
  expect(electrician.synonyms).toBeUndefined();
  expect(allSlugs(res.body)).toHaveLength(data.categories.length);
});

test('groups and categories follow sortOrder', async () => {
  const res = await request(app).get('/api/categories');
  expect(res.body.groups[0].slug).toBe(data.groups[0].slug);
  expect(res.body.groups[0].categories[0].slug).toBe('electrician');
});

test.each(['fr', '', 'HI-IN'])('unsupported lang %p falls back to English', async (lang) => {
  const res = await request(app).get(`/api/categories?lang=${lang}`);
  expect(res.status).toBe(200);
  expect(res.body.lang).toBe('en');
});

test('withSynonyms=1 includes synonyms in the requested language only', async () => {
  const res = await request(app).get('/api/categories?lang=hi&withSynonyms=1');
  const electrician = res.body.groups.flatMap((g) => g.categories).find((c) => c.slug === 'electrician');
  expect(electrician.synonyms).toEqual(expect.arrayContaining(['bijli wala']));
});

test('hides categories disabled for the city, case-insensitively', async () => {
  await Category.updateOne({ slug: 'bus_driver' }, { $set: { disabledCities: ['pune'] } });
  const res = await request(app).get('/api/categories?city=%20%20PUNE%20');
  expect(allSlugs(res.body)).not.toContain('bus_driver');
  const other = await request(app).get('/api/categories?city=Delhi');
  expect(allSlugs(other.body)).toContain('bus_driver');
});

test('omits inactive categories and empty groups', async () => {
  await Category.updateMany({ group: 'education' }, { $set: { isActive: false } });
  const res = await request(app).get('/api/categories');
  expect(res.body.groups.map((g) => g.slug)).not.toContain('education');
});

test('sets a cache header', async () => {
  const res = await request(app).get('/api/categories');
  expect(res.headers['cache-control']).toBe('public, max-age=3600');
});
