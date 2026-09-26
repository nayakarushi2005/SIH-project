const mongoose = require('mongoose');
const { LANGUAGES } = require('../services/profile');

const names = Object.fromEntries(LANGUAGES.map((l) => [l, { type: String, required: true }]));
const synonyms = Object.fromEntries(LANGUAGES.map((l) => [l, { type: [String], default: [] }]));

/**
 * A job category workers register for and customers book. `slug` is the
 * stable id stored on worker profiles — never rename one; retire it with
 * isActive:false instead.
 */
const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    group: { type: String, required: true, index: true }, // CategoryGroup slug
    ncoCode: { type: String, default: null }, // NCO-2015 / ISCO-08 unit group
    names,
    synonyms, // extra words people say for this job, used for voice matching
    icon: { type: String, required: true }, // MaterialCommunityIcons name
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    disabledCities: { type: [String], default: [] }, // lower-cased city names
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
