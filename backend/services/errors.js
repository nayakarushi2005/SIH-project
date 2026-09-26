/**
 * Shared shapes for coded errors, used by route handlers and validators so
 * the app can translate messages by `code` while the human `message` /
 * `error` text stays for anything that doesn't look it up.
 */

/** A validator throws this instead of a bare string when it has a stable code. */
function fieldError(code, message, params) {
  return params === undefined ? { code, message } : { code, message, params };
}

/** Sends a coded JSON error, keeping the existing `{ error }` shape. */
function sendError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: message, code, ...extra });
}

/**
 * Splits a `{ [field]: string | fieldError }` errors map into the pieces the
 * app needs: legacy string errors get `code: null` and no params.
 */
function splitFieldErrors(errors) {
  const fields = {};
  const fieldCodes = {};
  const fieldParams = {};

  for (const [field, value] of Object.entries(errors)) {
    if (typeof value === 'string') {
      fields[field] = value;
      fieldCodes[field] = null;
    } else {
      fields[field] = value.message;
      fieldCodes[field] = value.code;
      if (value.params !== undefined) fieldParams[field] = value.params;
    }
  }

  return { fields, fieldCodes, fieldParams };
}

module.exports = { fieldError, sendError, splitFieldErrors };
