const geo = require('../services/safetyGeo');
const trust = require('../services/safetyTrust');

// Pune, and times chosen by their hour in India (UTC+5:30).
const PUNE = { lat: 18.5204, lng: 73.8567 };
const NIGHT = new Date('2026-01-01T17:30:00Z'); // 23:00 IST
const MIDDAY = new Date('2026-01-01T06:30:00Z'); // 12:00 IST
const EVENING = new Date('2026-01-01T14:00:00Z'); // 19:30 IST

describe('safetyGeo', () => {
  test('distance and destination agree', () => {
    const p = geo.destinationPoint(PUNE.lat, PUNE.lng, 100, 90);
    expect(geo.distanceM(PUNE.lat, PUNE.lng, p.lat, p.lng)).toBeCloseTo(100, 3);
    expect(geo.bearingDeg(PUNE.lat, PUNE.lng, p.lat, p.lng)).toBeCloseTo(90, 1);
  });

  test('stationary blocks cover everything within 50 m and include the current block', () => {
    const blocks = geo.stationaryBlocks(PUNE.lat, PUNE.lng);
    expect(blocks).toContain(geo.geohash8(PUNE.lat, PUNE.lng));
    expect(blocks.length).toBeGreaterThan(5);
    for (const bearing of [0, 90, 180, 270]) {
      const edge = geo.destinationPoint(PUNE.lat, PUNE.lng, 40, bearing);
      expect(blocks).toContain(geo.geohash8(edge.lat, edge.lng));
    }
  });

  test('forward blocks start at the current block, are distinct, and are at most 6', () => {
    const blocks = geo.forwardBlocks(PUNE.lat, PUNE.lng, 45);
    expect(blocks[0]).toBe(geo.geohash8(PUNE.lat, PUNE.lng));
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks.length).toBeLessThanOrEqual(geo.FORWARD_BLOCKS + 1);
    expect(blocks.length).toBeGreaterThan(2);
  });

  test('window: on track, sliding near the end, and path change off the window', () => {
    const window = geo.forwardBlocks(PUNE.lat, PUNE.lng, 0);
    expect(geo.evaluateWindow(window[0], window, PUNE.lat, PUNE.lng, 0).status).toBe('ON_TRACK');

    const nearEnd = window[window.length - 2];
    expect(geo.evaluateWindow(nearEnd, window, PUNE.lat, PUNE.lng, 0).status).toBe('SLIDING_FORWARD');

    const away = geo.destinationPoint(PUNE.lat, PUNE.lng, 500, 180);
    const result = geo.evaluateWindow(geo.geohash8(away.lat, away.lng), window, away.lat, away.lng, 180);
    expect(result.status).toBe('PATH_CHANGED');
    expect(result.window[0]).toBe(geo.geohash8(away.lat, away.lng));
  });

  test('diffBlocks', () => {
    expect(geo.diffBlocks(['a', 'b'], ['b', 'c'])).toEqual({ toAdd: ['c'], toRemove: ['a'] });
  });
});

describe('safetyTrust', () => {
  test('time of day uses Indian local time', () => {
    expect(trust.timeOfDayMultiplier(NIGHT)).toBe(1.5);
    expect(trust.timeOfDayMultiplier(MIDDAY)).toBe(0.7);
    expect(trust.timeOfDayMultiplier(EVENING)).toBe(1.0);
  });

  test('false alarm decays trust, floors at 1, resets the streak', () => {
    expect(trust.applyFalseAlarm({ trustScore: 5, safeWalkStreak: 3, falseSosCount: 0 })).toEqual({
      trustScore: 3.35,
      safeWalkStreak: 0,
      falseSosCount: 1,
    });
    expect(trust.applyFalseAlarm({ trustScore: 1.2, falseSosCount: 4 }).trustScore).toBe(1);
  });

  test('real emergency adds 1, capped at 10', () => {
    expect(trust.applyRealEmergency({ trustScore: 5, safeWalkStreak: 2, falseSosCount: 1 })).toEqual({
      trustScore: 6,
      safeWalkStreak: 2,
      falseSosCount: 1,
    });
    expect(trust.applyRealEmergency({ trustScore: 9.6 }).trustScore).toBe(10);
  });

  test('every fifth safe walk gives +0.5, capped by verification, never lowering trust', () => {
    const base = { trustScore: 5, safeWalkStreak: 3, falseSosCount: 0 };
    expect(trust.applySafeWalk(base, false)).toMatchObject({ trustScore: 5, safeWalkStreak: 4, bonus: false });
    expect(trust.applySafeWalk({ ...base, safeWalkStreak: 4 }, false)).toMatchObject({
      trustScore: 5.5,
      safeWalkStreak: 0,
      bonus: true,
    });
    expect(trust.applySafeWalk({ ...base, trustScore: 7.4, safeWalkStreak: 4 }, false).trustScore).toBe(7.5);
    expect(trust.applySafeWalk({ ...base, trustScore: 7.4, safeWalkStreak: 4 }, true).trustScore).toBe(7.9);
    // Above the unverified cap from real emergencies: kept, not cut to 7.5.
    expect(trust.applySafeWalk({ ...base, trustScore: 9, safeWalkStreak: 4 }, false).trustScore).toBe(9);
  });

  test('block score falls with each SOS and recovers with time', () => {
    const one = trust.impactAfterSos(0, null, 5, EVENING); // weight 5 × 1.0
    expect(one).toBe(5);
    expect(trust.blockScore(one, EVENING, EVENING)).toBeCloseTo(7.79, 2);

    const three = [1, 2].reduce((impact) => trust.impactAfterSos(impact, EVENING, 5, EVENING), one);
    expect(trust.blockScore(three, EVENING, EVENING)).toBeCloseTo(4.72, 2);

    const weekLater = new Date(EVENING.getTime() + 7 * 24 * trust.MS_PER_HOUR);
    expect(trust.blockScore(three, EVENING, weekLater)).toBeGreaterThan(8.5);
    expect(trust.blockScore(0, null)).toBe(10);
    expect(trust.blockScore(1000, new Date())).toBe(1);
  });

  test('readTrust fills defaults for users from before the shield', () => {
    expect(trust.readTrust({})).toEqual({ trustScore: 5, safeWalkStreak: 0, falseSosCount: 0 });
  });
});
