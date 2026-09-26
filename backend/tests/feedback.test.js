const { validateFeedback } = require('../services/feedback');
const { splitFieldErrors } = require('../services/errors');

describe('validateFeedback — coded errors', () => {
  test('an invalid rating is a coded error', () => {
    const { errors } = validateFeedback({ rating: 0 });
    expect(errors.rating.code).toBe('feedback_rating_invalid');
  });

  test('an unknown praised trait is a coded error', () => {
    const { errors } = validateFeedback({ rating: 5, praised: ['not-a-trait'] });
    expect(errors.praised.code).toBe('feedback_praised_invalid');
  });

  test('an unknown criticized trait is a coded error', () => {
    const { errors } = validateFeedback({ rating: 5, criticized: ['not-a-trait'] });
    expect(errors.criticized.code).toBe('feedback_criticized_invalid');
  });

  test('a non-boolean rehire is a coded error', () => {
    const { errors } = validateFeedback({ rating: 5, rehire: 'yes' });
    expect(errors.rehire.code).toBe('feedback_rehire_invalid');
  });

  test('a comment over 500 characters is a coded error', () => {
    const { errors } = validateFeedback({ rating: 5, comment: 'a'.repeat(501) });
    expect(errors.comment.code).toBe('feedback_comment_length');
  });

  test('splitFieldErrors carries fieldCodes for a feedback validation response', () => {
    const { errors } = validateFeedback({ rating: 0 });
    const { fields, fieldCodes } = splitFieldErrors(errors);
    expect(fields.rating).toBeTruthy();
    expect(fieldCodes.rating).toBe('feedback_rating_invalid');
  });
});
