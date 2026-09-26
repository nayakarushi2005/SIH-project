const mongoose = require('mongoose');
const db = require('./setup');
const FederationMembership = require('../models/FederationMembership');
const requireRole = require('../middleware/requireRole');

beforeAll(async () => {
  await db.connect();
  await FederationMembership.syncIndexes();
});
afterEach(db.clear);
afterAll(db.close);

const ids = () => ({ user: new mongoose.Types.ObjectId(), federation: new mongoose.Types.ObjectId() });

test('a worker cannot hold two active memberships', async () => {
  const { user, federation } = ids();
  await FederationMembership.create({ user, federation, status: 'pending' });
  await expect(
    FederationMembership.create({ user, federation: new mongoose.Types.ObjectId(), status: 'verified' })
  ).rejects.toMatchObject({ code: 11000 });
});

test('past memberships do not block a new request', async () => {
  const { user, federation } = ids();
  await FederationMembership.create({ user, federation, status: 'left' });
  await FederationMembership.create({ user, federation, status: 'rejected' });
  await expect(FederationMembership.create({ user, federation, status: 'pending' })).resolves.toBeTruthy();
});

test('requireRole lets the right model through and blocks others', () => {
  const next = jest.fn();
  const res = { status: jest.fn(() => res), json: jest.fn() };
  requireRole('Federation')({ user: { userModel: 'Federation' } }, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  requireRole('Federation')({ user: { userId: 'x' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).toHaveBeenCalledTimes(1);
});
