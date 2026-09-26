const mongoose = require('mongoose');
const { LANGUAGES } = require('../services/profile');

const names = Object.fromEntries(LANGUAGES.map((l) => [l, { type: String, required: true }]));

const categoryGroupSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    names,
    icon: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CategoryGroup', categoryGroupSchema);
