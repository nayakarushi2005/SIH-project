const ngeohash = require('ngeohash');

/**
 * Geometry for the safety shield. The city is split into geohash-8 blocks
 * (~38 × 19 m). While a user has the shield open they are counted in a small
 * set of blocks around them: every block within 50 m while they stand still,
 * and their current block plus the next few ahead once they walk.
 */

const EARTH_RADIUS_M = 6371e3;

const STATIONARY_RADIUS_M = 50;
const MOVING_THRESHOLD_M = 15; // distance from the anchor that switches to MOVING
const BEARING_MIN_STEP_M = 2; // smaller steps are GPS jitter, not a new heading
const FORWARD_BLOCKS = 5;
const FORWARD_STEP_M = 30; // under a block's length, so no block is skipped

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in metres (haversine). */
function distanceM(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from the first point to the second, 0–360° clockwise from north. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `distance` metres from (lat, lng) along `bearing`. */
function destinationPoint(lat, lng, distance, bearing) {
  const angular = distance / EARTH_RADIUS_M;
  const b = toRad(bearing);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(b)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

const geohash8 = (lat, lng) => ngeohash.encode(lat, lng, 8);
const geohash6 = (lat, lng) => ngeohash.encode(lat, lng, 6);

/** A block's corners: { south, west, north, east }. */
function bounds(hash) {
  const [south, west, north, east] = ngeohash.decode_bbox(hash);
  return { south, west, north, east };
}

/** Every geohash-8 block whose centre is within `radius` (+10 m slack) of the point. */
function stationaryBlocks(lat, lng, radius = STATIONARY_RADIUS_M) {
  const latOffset = radius / 111320;
  const lngOffset = radius / (111320 * Math.cos(toRad(lat)));
  return ngeohash
    .bboxes(lat - latOffset, lng - lngOffset, lat + latOffset, lng + lngOffset, 8)
    .filter((hash) => {
      const { latitude, longitude } = ngeohash.decode(hash);
      return distanceM(lat, lng, latitude, longitude) <= radius + 10;
    });
}

/** The current block followed by the distinct blocks ahead along `bearing`. */
function forwardBlocks(lat, lng, bearing, count = FORWARD_BLOCKS) {
  const blocks = [geohash8(lat, lng)];
  for (let i = 1; i <= count; i += 1) {
    const p = destinationPoint(lat, lng, FORWARD_STEP_M * i, bearing);
    const hash = geohash8(p.lat, p.lng);
    if (!blocks.includes(hash)) blocks.push(hash);
  }
  return blocks.slice(0, count + 1);
}

/**
 * Decides what to do with a walking user's window of blocks:
 *   PATH_CHANGED    — they left the window (turned a corner): project a new one
 *   SLIDING_FORWARD — they reached its last two blocks: extend it ahead
 *   ON_TRACK        — keep it
 * Returns { status, window }.
 */
function evaluateWindow(current, window, lat, lng, bearing) {
  const index = window ? window.indexOf(current) : -1;
  if (index === -1) {
    return { status: 'PATH_CHANGED', window: forwardBlocks(lat, lng, bearing) };
  }
  if (index >= window.length - 2) {
    return { status: 'SLIDING_FORWARD', window: forwardBlocks(lat, lng, bearing) };
  }
  return { status: 'ON_TRACK', window };
}

/** Blocks to join and leave when moving from window `from` to `to`. */
function diffBlocks(from, to) {
  const before = new Set(from);
  const after = new Set(to);
  return {
    toAdd: [...after].filter((b) => !before.has(b)),
    toRemove: [...before].filter((b) => !after.has(b)),
  };
}

module.exports = {
  BEARING_MIN_STEP_M,
  FORWARD_BLOCKS,
  MOVING_THRESHOLD_M,
  STATIONARY_RADIUS_M,
  bearingDeg,
  bounds,
  destinationPoint,
  diffBlocks,
  distanceM,
  evaluateWindow,
  forwardBlocks,
  geohash6,
  geohash8,
  stationaryBlocks,
};
