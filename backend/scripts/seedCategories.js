/**
 * Loads data/categories.json into MongoDB. Safe to run any number of times:
 * rows are upserted by slug, and categories dropped from the file are
 * retired (isActive:false) rather than deleted, because worker profiles keep
 * referring to their slugs.
 *
 *   npm run seed:categories
 */
const mongoose = require('mongoose');
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');

async function seedCategories(data) {
  await CategoryGroup.bulkWrite(
    data.groups.map((g) => ({
      updateOne: { filter: { slug: g.slug }, update: { $set: g }, upsert: true },
    }))
  );

  await Category.bulkWrite(
    data.categories.map((c) => ({
      updateOne: {
        filter: { slug: c.slug },
        update: { $set: { disabledCities: [], ...c, isActive: true } },
        upsert: true,
      },
    }))
  );

  const slugs = data.categories.map((c) => c.slug);
  const retired = await Category.updateMany(
    { slug: { $nin: slugs }, isActive: true },
    { $set: { isActive: false } }
  );

  return {
    groups: data.groups.length,
    categories: data.categories.length,
    retired: retired.modifiedCount,
  };
}

if (require.main === module) {
  require('dotenv').config();
  const data = require('../data/categories.json');
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sih-database';
  mongoose
    .connect(uri)
    .then(() => seedCategories(data))
    .then((r) => console.log(`Seeded ${r.groups} groups, ${r.categories} categories, retired ${r.retired}.`))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { seedCategories };
