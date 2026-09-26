const jwt = require('jsonwebtoken');
const User = require('../models/User');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let seq = 0;
function createUser(overrides = {}) {
  seq += 1;
  return User.create({
    googleId: `g-${seq}-${Date.now()}`,
    googleEmail: `user${seq}-${Date.now()}@example.com`,
    ...overrides,
  });
}

function authHeader(user) {
  return { Authorization: `Bearer ${jwt.sign({ userId: user._id }, process.env.JWT_SECRET)}` };
}

module.exports = { createUser, authHeader };
