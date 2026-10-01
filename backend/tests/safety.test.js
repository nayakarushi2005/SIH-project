jest.mock('../services/queue', () => ({
  getQueue: () => ({ add: jest.fn().mockResolvedValue({}) }),
  withTimeout: (promise) => promise,
  redisConnection: jest.fn(),
}));

const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const GovOfficial = require('../models/GovOfficial');
const SafetyBlock = require('../models/SafetyBlock');
const SafetySession = require('../models/SafetySession');
const SosAlert = require('../models/SosAlert');
const User = require('../models/User');
const VoiceNote = require('../models/VoiceNote');
const geo = require('../services/safetyGeo');
const safety = require('../services/safety');
const { generateAccessToken } = require('../utils/tokenUtils');
const { createUser, authHeader } = require('./helpers');

process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo-cloud';

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

const PUNE = { lat: 18.5204, lng: 73.8567 };
const moved = (metres, bearing, from = PUNE) => geo.destinationPoint(from.lat, from.lng, metres, bearing);

async function openShield(user, location = PUNE) {
  return request(app).post('/api/safety/session').set(authHeader(user)).send({ location });
}

describe('shield session', () => {
  test('opening counts the user in every block within 50 m', async () => {
    const user = await createUser();
    const res = await openShield(user);

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ mode: 'STATIONARY', companionsNearby: 0 });
    expect(res.body.block).toMatchObject({ geohash: geo.geohash8(PUNE.lat, PUNE.lng), score: 10, sosCount: 0 });
    const { south, west, north, east } = res.body.block.bounds;
    expect(PUNE.lat).toBeGreaterThanOrEqual(south);
    expect(PUNE.lat).toBeLessThanOrEqual(north);
    expect(PUNE.lng).toBeGreaterThanOrEqual(west);
    expect(PUNE.lng).toBeLessThanOrEqual(east);
    expect(res.body.trust).toEqual({ trustScore: 5, safeWalkStreak: 0, falseSosCount: 0, isVerified: false });
    expect(res.body.sos).toBeNull();

    const expected = geo.stationaryBlocks(PUNE.lat, PUNE.lng);
    expect(res.body.session.blocksWatched).toBe(expected.length);
    expect(await SafetyBlock.countDocuments({ activeUsers: user._id })).toBe(expected.length);
  });

  test('opening twice keeps one session', async () => {
    const user = await createUser();
    await openShield(user);
    await openShield(user);
    expect(await SafetySession.countDocuments({ user: user._id })).toBe(1);
  });

  test('walking 15 m switches to the forward path and drops the radius blocks', async () => {
    const user = await createUser();
    await openShield(user);
    const res = await request(app)
      .post('/api/safety/session/location')
      .set(authHeader(user))
      .send({ location: moved(20, 90) });

    expect(res.body.session.mode).toBe('MOVING');
    const session = await SafetySession.findOne({ user: user._id });
    expect(session.blocks[0]).toBe(geo.geohash8(moved(20, 90).lat, moved(20, 90).lng));
    expect(await SafetyBlock.countDocuments({ activeUsers: user._id })).toBe(session.blocks.length);
    // Radius blocks nobody reported in are gone.
    expect(await SafetyBlock.countDocuments()).toBe(session.blocks.length);
  });

  test('another shield user in the same blocks is counted as a companion', async () => {
    const a = await createUser();
    const b = await createUser();
    await openShield(a);
    const res = await openShield(b, moved(5, 0));
    expect(res.body.session.companionsNearby).toBe(1);
  });

  test('a bad location is a coded 400', async () => {
    const user = await createUser();
    const res = await openShield(user, { lat: 'x', lng: 73 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(res.body.fieldCodes.location).toBe('safety_location_invalid');
  });

  test('requires the app token', async () => {
    const res = await request(app).get('/api/safety/me');
    expect(res.status).toBe(401);
  });
});

describe('SOS', () => {
  test('raising an SOS records it in the block and is idempotent', async () => {
    const user = await createUser();
    await openShield(user);
    const first = await request(app).post('/api/safety/sos').set(authHeader(user)).send({ trigger: 'voice' });
    const second = await request(app).post('/api/safety/sos').set(authHeader(user)).send({});

    expect(first.status).toBe(201);
    expect(first.body.sos).toMatchObject({ trigger: 'voice' });
    expect(second.body.sos.id).toBe(first.body.sos.id);
    expect(first.body.block.sosCount).toBe(1);
    expect(first.body.block.score).toBeLessThan(10);
    expect(await SosAlert.countDocuments()).toBe(1);
  });

  test('without an open shield it needs a location', async () => {
    const user = await createUser();
    const res = await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    expect(res.status).toBe(400);
    expect(res.body.fieldCodes.location).toBe('safety_location_required');

    const withLocation = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(user))
      .send({ location: PUNE, trigger: 'notification' });
    expect(withLocation.status).toBe(201);
    expect(withLocation.body.sos.trigger).toBe('notification');
  });

  test('the SOS follows the user and marks each new block they enter', async () => {
    const user = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const next = moved(60, 90);
    await request(app).post('/api/safety/session/location').set(authHeader(user)).send({ location: next });

    const alert = await SosAlert.findOne();
    expect(alert.location.coordinates).toEqual([next.lng, next.lat]);
    expect(alert.path).toHaveLength(2);
    const block = await SafetyBlock.findOne({ geohash: geo.geohash8(next.lat, next.lng) });
    expect(block.sosCount).toBe(1);
  });

  test('nearby shield users see the SOS within 2.5 km; the sender and far users do not', async () => {
    const sender = await createUser();
    const near = await createUser();
    const far = await createUser();
    await openShield(sender);
    await request(app).post('/api/safety/sos').set(authHeader(sender)).send({});

    const nearRes = await openShield(near, moved(800, 45));
    const farRes = await openShield(far, moved(5000, 45));
    const self = await request(app).get('/api/safety/me').set(authHeader(sender));

    expect(nearRes.body.nearby).toHaveLength(1);
    expect(nearRes.body.nearby[0].distanceM).toBeGreaterThan(780);
    expect(nearRes.body.nearby[0].distanceM).toBeLessThan(820);
    expect(nearRes.body.nearby[0].lat).toBeCloseTo(PUNE.lat, 6);
    expect(farRes.body.nearby).toEqual([]);
    expect(self.body.nearby).toEqual([]);
  });

  test('stopping asks for an outcome once; a false alarm cuts trust', async () => {
    const user = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const stop = await request(app).delete('/api/safety/sos').set(authHeader(user));

    expect(stop.status).toBe(200);
    expect(stop.body.sos).toBeNull();
    expect(stop.body.pendingOutcome.id).toBe(stop.body.endedAlertId);

    const answer = await request(app)
      .post(`/api/safety/sos/${stop.body.endedAlertId}/outcome`)
      .set(authHeader(user))
      .send({ outcome: 'false_alarm' });
    expect(answer.body.trust).toEqual({ trustScore: 3.35, safeWalkStreak: 0, falseSosCount: 1 });
    expect((await User.findById(user._id)).safety.trustScore).toBe(3.35);

    const again = await request(app)
      .post(`/api/safety/sos/${stop.body.endedAlertId}/outcome`)
      .set(authHeader(user))
      .send({ outcome: 'real_emergency' });
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('sos_outcome_not_found');

    const status = await request(app).get('/api/safety/me').set(authHeader(user));
    expect(status.body.pendingOutcome).toBeNull();
  });

  test('a real emergency raises trust; another user cannot answer for it', async () => {
    const user = await createUser();
    const other = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const { body } = await request(app).delete('/api/safety/sos').set(authHeader(user));

    const hijack = await request(app)
      .post(`/api/safety/sos/${body.endedAlertId}/outcome`)
      .set(authHeader(other))
      .send({ outcome: 'false_alarm' });
    expect(hijack.status).toBe(404);

    const answer = await request(app)
      .post(`/api/safety/sos/${body.endedAlertId}/outcome`)
      .set(authHeader(user))
      .send({ outcome: 'real_emergency' });
    expect(answer.body.trust.trustScore).toBe(6);
  });

  test('an unknown outcome is a coded 400', async () => {
    const user = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const { body } = await request(app).delete('/api/safety/sos').set(authHeader(user));
    const res = await request(app)
      .post(`/api/safety/sos/${body.endedAlertId}/outcome`)
      .set(authHeader(user))
      .send({ outcome: 'maybe' });
    expect(res.status).toBe(400);
    expect(res.body.fieldCodes.outcome).toBe('safety_outcome_invalid');
  });
});

describe('closing the shield', () => {
  test('leaves every block, keeping only blocks with reports', async () => {
    const user = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const res = await request(app).delete('/api/safety/session').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.safeWalk).toBeNull(); // raised an SOS
    expect(res.body.endedAlertId).toBeTruthy(); // the SOS still on was ended
    expect(await SafetySession.countDocuments()).toBe(0);
    expect(await SafetyBlock.countDocuments({ activeUsers: user._id })).toBe(0);
    expect(await SafetyBlock.countDocuments()).toBe(1);
    expect(await SosAlert.countDocuments({ status: 'active' })).toBe(0);
  });

  test('a walk of 10+ minutes without SOS earns safe-walk credit; a short one does not', async () => {
    const user = await createUser();
    await openShield(user);
    const short = await request(app).delete('/api/safety/session').set(authHeader(user));
    expect(short.body.safeWalk).toBeNull();

    await openShield(user);
    await SafetySession.updateOne({ user: user._id }, { $set: { startedAt: new Date(Date.now() - 11 * 60 * 1000) } });
    const long = await request(app).delete('/api/safety/session').set(authHeader(user));
    expect(long.body.safeWalk).toEqual({ streak: 1, bonus: false });
    expect((await User.findById(user._id)).safety.safeWalkStreak).toBe(1);
  });

  test('the sweep closes quiet shields and expires quiet alerts', async () => {
    const user = await createUser();
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const later = new Date(Date.now() + safety.ALERT_QUIET_MS + 60 * 1000);

    expect(await safety.expireQuietAlerts(later)).toBe(1);
    expect(await safety.closeQuietSessions(later)).toBe(1);
    expect(await SafetySession.countDocuments()).toBe(0);
    expect(await SosAlert.countDocuments({ status: 'expired' })).toBe(1);
    expect(await SafetyBlock.countDocuments({ activeUsers: user._id })).toBe(0);
  });
});

describe('voice notes', () => {
  const ownUrl = (user) => `https://res.cloudinary.com/demo-cloud/video/upload/v1/sih/voice/${user._id}/note.m4a`;

  test('signing pins the upload to the user’s folder as audio', async () => {
    const user = await createUser();
    const res = await request(app).post('/api/safety/voice/sign').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-cloud/video/upload');
    expect(res.body.folder).toBe(`sih/voice/${user._id}`);
  });

  test('a note is linked to the running SOS and waits for analysis', async () => {
    const user = await createUser();
    await openShield(user);
    const sos = await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const res = await request(app)
      .post('/api/safety/voice')
      .set(authHeader(user))
      .send({ audioUrl: ownUrl(user), durationMs: 12000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ alertId: sos.body.sos.id, durationMs: 12000, location: PUNE });
    expect(res.body.analysis.status).toBe('pending');

    const list = await request(app).get('/api/safety/voice').set(authHeader(user));
    expect(list.body.notes).toHaveLength(1);
  });

  test('someone else’s upload is refused', async () => {
    const user = await createUser();
    const other = await createUser();
    const res = await request(app)
      .post('/api/safety/voice')
      .set(authHeader(user))
      .send({ audioUrl: ownUrl(other) });
    expect(res.status).toBe(400);
    expect(res.body.fieldCodes.audioUrl).toBe('voice_note_url_invalid');
    expect(await VoiceNote.countDocuments()).toBe(0);
  });
});

describe('officials', () => {
  async function official() {
    const gov = await GovOfficial.create({ googleId: 'gov-1', email: 'gov@example.gov.in', name: 'Officer' });
    return { Authorization: `Bearer ${generateAccessToken(gov._id, 'GovOfficial')}` };
  }

  test('see active alerts with who raised them, and mark notes listened', async () => {
    const user = await createUser({ name: 'Priya', phone: '9876543210' });
    await openShield(user);
    await request(app).post('/api/safety/sos').set(authHeader(user)).send({});
    const note = await request(app)
      .post('/api/safety/voice')
      .set(authHeader(user))
      .send({ audioUrl: `https://res.cloudinary.com/demo-cloud/video/upload/sih/voice/${user._id}/a.m4a` });
    const headers = await official();

    const alerts = await request(app).get('/api/gov/safety/alerts').set(headers);
    expect(alerts.status).toBe(200);
    expect(alerts.body.alerts).toHaveLength(1);
    expect(alerts.body.alerts[0]).toMatchObject({
      status: 'active',
      voiceNotes: 1,
      user: { name: 'Priya', phone: '9876543210', trustScore: 5 },
    });

    const listened = await request(app)
      .patch(`/api/gov/safety/voice-notes/${note.body.id}/listened`)
      .set(headers);
    expect(listened.body.listenedAt).toBeTruthy();
    const unheard = await request(app).get('/api/gov/safety/voice-notes?unheard=1').set(headers);
    expect(unheard.body.notes).toEqual([]);

    const blocks = await request(app).get('/api/gov/safety/blocks').set(headers);
    expect(blocks.body.blocks[0]).toMatchObject({ sosCount: 1 });
  });

  test('app users and federations are refused', async () => {
    const user = await createUser();
    const asApp = await request(app).get('/api/gov/safety/alerts').set(authHeader(user));
    expect(asApp.status).toBe(403);
    const asFederation = await request(app)
      .get('/api/gov/safety/alerts')
      .set({ Authorization: `Bearer ${generateAccessToken(user._id, 'Federation')}` });
    expect(asFederation.status).toBe(403);
  });
});
