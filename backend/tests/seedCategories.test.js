const db = require('./setup');
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');
const { seedCategories } = require('../scripts/seedCategories');
const data = require('../data/categories.json');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

test('seeds all groups and categories', async () => {
  const result = await seedCategories(data);
  expect(result.categories).toBe(data.categories.length);
  expect(await CategoryGroup.countDocuments()).toBe(data.groups.length);
  expect(await Category.countDocuments({ isActive: true })).toBe(data.categories.length);
});

test('is idempotent', async () => {
  await seedCategories(data);
  await seedCategories(data);
  expect(await Category.countDocuments()).toBe(data.categories.length);
});

test('retires categories removed from the file instead of deleting them', async () => {
  await seedCategories(data);
  const [, ...rest] = data.categories;
  const result = await seedCategories({ ...data, categories: rest });
  expect(result.retired).toBe(1);
  const removed = await Category.findOne({ slug: data.categories[0].slug });
  expect(removed.isActive).toBe(false);
});

test('re-activates a category that comes back', async () => {
  await seedCategories(data);
  const [, ...rest] = data.categories;
  await seedCategories({ ...data, categories: rest });
  await seedCategories(data);
  expect((await Category.findOne({ slug: data.categories[0].slug })).isActive).toBe(true);
});
