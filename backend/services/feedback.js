/**
 * What a client may send when rating the worker who completed their job.
 */

const { fieldError } = require('./errors');
const { TRAIT_IDS } = require('./traits');

function traitList(v, label, code) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((t) => TRAIT_IDS.includes(t))) {
    throw fieldError(code, `Choose ${label} from the list.`);
  }
  return [...new Set(v)];
}

/**
 * Validates a feedback body.
 * Returns { fields, errors } — errors is keyed by field name.
 */
function validateFeedback(body) {
  const fields = {};
  const errors = {};

  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = fieldError('feedback_rating_invalid', 'Choose a rating from 1 to 5 stars.');
  } else {
    fields.rating = rating;
  }

  try {
    fields.praised = traitList(body?.praised, 'what went well', 'feedback_praised_invalid');
  } catch (message) {
    errors.praised = message;
  }
  try {
    fields.criticized = traitList(body?.criticized, 'what could be better', 'feedback_criticized_invalid');
  } catch (message) {
    errors.criticized = message;
  }
  if (fields.praised && fields.criticized?.some((t) => fields.praised.includes(t))) {
    errors.criticized = fieldError(
      'feedback_traits_conflict',
      'Something can’t be both good and bad — pick one.'
    );
  }

  const { rehire, block } = body ?? {};
  if (rehire !== undefined && rehire !== null && typeof rehire !== 'boolean') {
    errors.rehire = fieldError('feedback_rehire_invalid', 'Answer yes or no.');
  } else {
    fields.rehire = rehire ?? null;
  }
  fields.block = block === true;
  if (fields.block) fields.rehire = false; // blocking means "not again"

  const comment = typeof body?.comment === 'string' ? body.comment.trim().replace(/\s+/g, ' ') : '';
  if (comment.length > 500) {
    errors.comment = fieldError('feedback_comment_length', 'Keep your comment under 500 characters.');
  } else {
    fields.comment = comment || null;
  }

  return { fields, errors };
}

module.exports = {
  validateFeedback,
};
