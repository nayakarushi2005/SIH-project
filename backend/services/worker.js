/**
 * Rules for registering as a worker. Shared by the manual form and the
 * voice assistant — both submit through POST /api/worker/register.
 */
const Category = require('../models/Category');
const { validateName } = require('./profile');

// Yearly income in ₹: <1L, 1–2.5L, 2.5–5L, 5–10L, >10L.
// Mirrored in client-native/src/constants/worker.js and the AI service.
const INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l'];
const MAX_CATEGORIES = 10;

async function validateRegistration(user, body = {}) {
  const updates = {};
  const errors = {};

  // Verified users keep their Aadhaar name. Others must have a name — sent
  // now, or saved earlier (e.g. when registering again after deregistering).
  if (!user.isAadhaarVerified) {
    const given = body.name !== undefined && body.name !== null && String(body.name).trim() !== '';
    try {
      if (given) updates.name = validateName(body.name);
      else if (!user.name) throw 'Enter your full name.';
    } catch (message) {
      errors.name = message;
    }
  }

  if (!INCOME_BRACKETS.includes(body.incomeBracket)) {
    errors.incomeBracket = 'Choose your yearly income.';
  }

  const slugs = Array.isArray(body.categories) ? [...new Set(body.categories.map(String))] : null;
  if (!slugs || slugs.length === 0) {
    errors.categories = 'Choose at least one kind of work.';
  } else if (slugs.length > MAX_CATEGORIES) {
    errors.categories = `Choose up to ${MAX_CATEGORIES} kinds of work.`;
  } else {
    const active = await Category.countDocuments({ slug: { $in: slugs }, isActive: true });
    if (active !== slugs.length) errors.categories = 'Some of the chosen work types are not available.';
  }

  if (Object.keys(errors).length === 0) {
    updates.categories = slugs;
    updates.incomeBracket = body.incomeBracket;
    updates.onboardedVia = body.onboardedVia === 'voice' ? 'voice' : 'form';
  }
  return { updates, errors };
}

module.exports = { INCOME_BRACKETS, MAX_CATEGORIES, validateRegistration };
