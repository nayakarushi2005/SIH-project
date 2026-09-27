/**
 * Web-portal role gate, used after ensureAuth. `model` is the token's
 * userModel: 'Federation' or 'GovOfficial'. App (worker) tokens carry no
 * userModel, so they never pass.
 */
function requireRole(model) {
  return function roleGate(req, res, next) {
    if (req.user?.userModel !== model) {
      return res.status(403).json({ message: 'You do not have access to this action.' });
    }
    return next();
  };
}

module.exports = requireRole;
