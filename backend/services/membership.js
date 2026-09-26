/**
 * Workers joining federations. Everything that reads or changes a
 * FederationMembership goes through here so the rules live in one place:
 * only verified federations, only nearby ones, one active membership.
 */
const mongoose = require('mongoose');
const Federation = require('../models/Federation');
const FederationMembership = require('../models/FederationMembership');
const User = require('../models/User');
const { ACTIVE_STATUSES } = require('../models/FederationMembership');
const { toProfile } = require('./profile');

class MembershipError extends Error {
  constructor(code, httpStatus, message) {
    super(message || code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const MESSAGES = {
  no_location: 'Add your city or PIN code to see federations near you.',
  not_worker: 'Register as a worker first.',
  not_nearby: 'That federation is not available in your area.',
  already_member: 'You already have a federation request. Leave it first to join another.',
  not_member: 'You are not part of a federation.',
  not_found: 'That request was not found.',
  not_pending: 'That request has already been handled.',
  federation_unverified: 'Your federation must be verified by the government first.',
};

function fail(code, httpStatus) {
  throw new MembershipError(code, httpStatus, MESSAGES[code]);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

async function memberCounts(federationIds) {
  const rows = await FederationMembership.aggregate([
    { $match: { federation: { $in: federationIds }, status: 'verified' } },
    { $group: { _id: '$federation', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function memberCount(federationId) {
  return FederationMembership.countDocuments({ federation: federationId, status: 'verified' });
}

/** Verified federations for this worker: same PIN, else same city. */
async function nearbyFederations(user) {
  const pincode = (user.pincode || '').trim();
  const city = (user.city || '').trim();
  if (!pincode && !city) fail('no_location', 400);

  let match = 'pincode';
  let feds = pincode ? await Federation.find({ status: 'verified', pincode }).sort({ name: 1 }).lean() : [];
  if (feds.length === 0 && city) {
    match = 'city';
    feds = await Federation.find({
      status: 'verified',
      city: { $regex: `^\\s*${escapeRegex(city)}\\s*$`, $options: 'i' },
    })
      .sort({ name: 1 })
      .lean();
  }
  return { match, feds };
}

async function findNearby(user) {
  const { match, feds } = await nearbyFederations(user);
  const ids = feds.map((f) => f._id);
  const [counts, mine] = await Promise.all([
    memberCounts(ids),
    FederationMembership.find({ user: user._id, federation: { $in: ids } }).sort({ createdAt: -1 }).lean(),
  ]);
  const latest = new Map();
  for (const m of mine) if (!latest.has(String(m.federation))) latest.set(String(m.federation), m.status);
  return {
    match,
    federations: feds.map((f) => {
      const status = latest.get(String(f._id));
      return {
        id: String(f._id),
        name: f.name,
        city: f.city,
        pincode: f.pincode,
        memberCount: counts.get(String(f._id)) || 0,
        match,
        myStatus: status && status !== 'left' ? status : null,
      };
    }),
  };
}

async function requestMembership(user, federationId) {
  if (!user.isWorker) fail('not_worker', 403);
  if (!isId(federationId)) fail('not_nearby', 404);
  const { feds } = await nearbyFederations(user);
  if (!feds.some((f) => String(f._id) === String(federationId))) fail('not_nearby', 404);
  try {
    await FederationMembership.create({ user: user._id, federation: federationId, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) fail('already_member', 409);
    throw err;
  }
}

async function leaveMembership(user, { quiet = false } = {}) {
  const res = await FederationMembership.updateMany(
    { user: user._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'left', decidedAt: new Date() } }
  );
  if (res.modifiedCount === 0 && !quiet) fail('not_member', 404);
}

/**
 * The worker's most recent membership, shown on the profile — null once
 * they left it. Still returned if the federation was deleted (name null),
 * so an active one can be seen and left.
 */
async function currentMembership(userId) {
  const m = await FederationMembership.findOne({ user: userId }).sort({ createdAt: -1 }).lean();
  if (!m || m.status === 'left') return null;
  const federation = await Federation.findById(m.federation).select('name').lean();
  return { id: String(m.federation), name: federation?.name ?? null, status: m.status };
}

async function buildProfile(user) {
  return { ...toProfile(user), federation: await currentMembership(user._id) };
}

// ── Federation side (web portal) ────────────────────────────────────────────

async function loadVerifiedFederation(federationId) {
  const federation = await Federation.findById(federationId).lean();
  if (!federation || federation.status !== 'verified') fail('federation_unverified', 403);
  return federation;
}

async function listRequests(federationId, status = 'pending') {
  await loadVerifiedFederation(federationId);
  const wanted = status === 'verified' ? 'verified' : 'pending';
  const rows = await FederationMembership.find({ federation: federationId, status: wanted })
    .sort({ requestedAt: 1 })
    .lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.user) } })
    .select('name isAadhaarVerified worker.categories city pincode')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => {
    const u = byId.get(String(r.user)) || {};
    return {
      id: String(r._id),
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      worker: {
        name: u.name || null,
        isAadhaarVerified: !!u.isAadhaarVerified,
        categories: u.worker?.categories || [],
        city: u.city || null,
        pincode: u.pincode || null,
      },
    };
  });
}

/**
 * Move one of this federation's memberships from `from` to a new status in
 * a single conditional update, so a worker cancelling at the same moment
 * can't be overwritten. 404 if it isn't theirs, 409 if it already moved on.
 */
async function transition(federationId, membershipId, from, set) {
  await loadVerifiedFederation(federationId);
  if (!isId(membershipId)) fail('not_found', 404);
  let m;
  try {
    m = await FederationMembership.findOneAndUpdate(
      { _id: membershipId, federation: federationId, status: from },
      { $set: { ...set, decidedAt: new Date() } },
      { new: true }
    ).lean();
  } catch (err) {
    if (err.code === 11000) fail('not_pending', 409);
    throw err;
  }
  if (!m) {
    const exists = await FederationMembership.findOne({ _id: membershipId, federation: federationId });
    fail(exists ? 'not_pending' : 'not_found', exists ? 409 : 404);
  }
  return { id: String(m._id), status: m.status };
}

function decideRequest(federationId, membershipId, action, reason) {
  return transition(federationId, membershipId, 'pending', {
    status: action === 'accept' ? 'verified' : 'rejected',
    rejectionReason: action === 'reject' ? String(reason || '').trim().slice(0, 300) || null : null,
  });
}

function removeMember(federationId, membershipId) {
  return transition(federationId, membershipId, 'verified', { status: 'removed' });
}

/** Express helper: turn a MembershipError into a JSON response. */
function sendMembershipError(res, err, key = 'error') {
  if (err instanceof MembershipError) {
    return res.status(err.httpStatus).json({ [key]: err.message, code: err.code });
  }
  console.error('Membership error:', err.message);
  return res.status(500).json({ [key]: 'Something went wrong. Please try again.' });
}

module.exports = {
  MembershipError,
  buildProfile,
  currentMembership,
  decideRequest,
  findNearby,
  leaveMembership,
  listRequests,
  memberCount,
  removeMember,
  requestMembership,
  sendMembershipError,
};
