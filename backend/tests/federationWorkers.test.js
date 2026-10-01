const request = require('supertest');
const db = require('./setup');
const app = require('../app');
const Federation = require('../models/Federation');
const FederationMembership = require('../models/FederationMembership');
const FederationWorker = require('../models/FederationWorker');
const { generateAccessToken } = require('../utils/tokenUtils');
const { createUser, authHeader } = require('./helpers');

process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';

beforeAll(async () => {
  await db.connect();
  await FederationMembership.syncIndexes();
  await FederationWorker.syncIndexes();
});
afterEach(db.clear);
afterAll(db.close);

const AADHAAR = '234123412346';
const OTHER_AADHAAR = '499123456783';
const MESSAGES = {
  name: 'Enter the full name (letters only).',
  phone: 'Enter a valid 10-digit mobile number.',
  aadhaar: 'Enter a valid 12-digit Aadhaar number.',
  photoRequired: 'Add a photo of the worker.',
  photoLink: 'Photo must be a link starting with http:// or https://.',
  duplicate: 'A worker with this mobile number is already in your federation.',
  duplicateInSheet: 'This mobile number appears more than once in the sheet.',
  emptyImport: 'The sheet has no workers to import.',
  tooManyRows: 'Import up to 2000 workers at a time.',
};

let n = 0;
const fed = (over = {}) => {
  n += 1;
  return Federation.create({ fedId: `FW-${n}`, name: `Fed ${n}`, email: `fw${n}@x.org`, status: 'verified', city: 'Pune', pincode: '411001', ...over });
};
const as = (doc, model) => ({ Authorization: `Bearer ${generateAccessToken(doc._id, model)}` });
const photoFor = (f, file = 'asha.jpg') => `https://res.cloudinary.com/demo/image/upload/v1712345678/sih/federations/${f._id}/workers/${file}`;
const manual = (f, over = {}) => ({ name: 'Asha Devi', phone: '9876543210', aadhaar: AADHAAR, photoUrl: photoFor(f), ...over });
const add = (f, body) => request(app).post('/api/federation/me/workers').set(as(f, 'Federation')).send(body);
const importRows = (f, rows) => request(app).post('/api/federation/me/workers/import').set(as(f, 'Federation')).send({ rows });

async function verifiedMember(f, over = {}) {
  const user = await createUser({ name: 'Ravi', isWorker: true, city: 'Pune', pincode: '411001', ...over });
  await FederationMembership.create({ user: user._id, federation: f._id, status: 'verified', decidedAt: new Date() });
  return user;
}

describe('adding a worker by hand', () => {
  test('a valid worker is saved with a normalized name and phone and only the last 4 Aadhaar digits', async () => {
    const f = await fed();
    const res = await add(f, manual(f, { name: '  Asha   Devi ', phone: '+91 98765-43210', aadhaar: '2341 2341 2346' }));
    expect(res.status).toBe(201);
    expect(res.body.worker).toMatchObject({
      name: 'Asha Devi',
      phone: '9876543210',
      aadhaar: 'XXXX-XXXX-2346',
      photoUrl: photoFor(f),
      source: 'manual',
    });
    expect(res.body.worker.id).toEqual(expect.any(String));
    expect(res.body.worker.addedAt).toEqual(expect.any(String));
    const saved = await FederationWorker.findById(res.body.worker.id).lean();
    expect(saved).toMatchObject({ aadhaarLast4: '2346', status: 'active', source: 'manual' });
    expect(JSON.stringify(saved)).not.toContain(AADHAAR);
  });

  test.each([
    ['0 prefix', '09876543210'],
    ['91 prefix', '919876543210'],
    ['dots and brackets', '(98765) 432.10'],
  ])('a phone with a %s is accepted', async (_, phone) => {
    const f = await fed();
    const res = await add(f, manual(f, { phone }));
    expect(res.status).toBe(201);
    expect(res.body.worker.phone).toBe('9876543210');
  });

  test.each([
    ['name', { name: 'A' }],
    ['name', { name: 'Asha 2' }],
    ['name', { name: undefined }],
    ['phone', { phone: '12345' }],
    ['phone', { phone: '5876543210' }],
    ['aadhaar', { aadhaar: '234123412347' }],
    ['aadhaar', { aadhaar: '134123412346' }],
    ['aadhaar', { aadhaar: '23412341234' }],
  ])('an invalid %s is a 400 for that field only', async (field, over) => {
    const f = await fed();
    const res = await add(f, manual(f, over));
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ [field]: MESSAGES[field] });
    expect(await FederationWorker.countDocuments()).toBe(0);
  });

  test.each([
    ['missing', undefined],
    ['blank', '   '],
    ["from another federation's folder", 'other'],
    ['not on Cloudinary', 'https://example.org/asha.jpg'],
    ['in a job photo folder', 'job'],
  ])('a photo that is %s is a 400', async (_, photo) => {
    const f = await fed();
    const other = await fed();
    let photoUrl = photo;
    if (photo === 'other') photoUrl = photoFor(other);
    if (photo === 'job') photoUrl = `https://res.cloudinary.com/demo/image/upload/sih/jobs/${f._id}/asha.jpg`;
    const res = await add(f, manual(f, { photoUrl }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ photoUrl: MESSAGES.photoRequired });
  });

  test('a phone already on the roster is a 409 on the phone field', async () => {
    const f = await fed();
    await add(f, manual(f));
    const res = await add(f, manual(f, { name: 'Someone Else', phone: '+919876543210', aadhaar: OTHER_AADHAAR }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: MESSAGES.duplicate, code: 'duplicate_worker', fields: { phone: MESSAGES.duplicate } });
  });

  test('a phone of a verified app member is a 409, a pending one is not', async () => {
    const f = await fed();
    await verifiedMember(f, { phone: '9876543210' });
    const pending = await createUser({ phone: '9123456789' });
    await FederationMembership.create({ user: pending._id, federation: f._id, status: 'pending' });
    const taken = await add(f, manual(f));
    expect(taken.status).toBe(409);
    expect(taken.body.fields).toEqual({ phone: MESSAGES.duplicate });
    const free = await add(f, manual(f, { phone: '9123456789' }));
    expect(free.status).toBe(201);
  });

  test('the same phone can be on two federations, and re-added after removal', async () => {
    const f = await fed();
    const other = await fed();
    const first = await add(f, manual(f));
    expect((await add(other, manual(other))).status).toBe(201);
    await request(app).delete(`/api/federation/me/workers/${first.body.worker.id}`).set(as(f, 'Federation'));
    expect((await add(f, manual(f))).status).toBe(201);
  });

  test('a duplicate that slips past the check is still a 409', async () => {
    const f = await fed();
    await add(f, manual(f));
    const spy = jest.spyOn(FederationWorker, 'distinct').mockResolvedValueOnce([]);
    const res = await add(f, manual(f));
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(res.body.fields).toEqual({ phone: MESSAGES.duplicate });
  });
});

describe('importing workers', () => {
  test('mixed rows keep their order, row numbers and reasons', async () => {
    const f = await fed();
    await add(f, manual(f, { phone: '9000000001' }));
    const res = await importRows(f, [
      { row: 2, name: 'Ravi Kumar', phone: 9123456780, aadhaar: 234123412346, photoUrl: null },
      { row: 3, name: 'R2', phone: '123', aadhaar: '111', photoUrl: 'ftp://x.org/a.jpg' },
      { row: 4, name: 'Sita Ram', phone: '9000000001', aadhaar: OTHER_AADHAAR },
      { row: 6, name: 'Meena Bai', phone: '+91 91234 56781', aadhaar: AADHAAR, photoUrl: ' https://example.org/meena.jpg ' },
      { row: 9, name: 'Meena Again', phone: '9123456781', aadhaar: AADHAAR },
      { name: 'Gopal', phone: '9123456782', aadhaar: AADHAAR, photoUrl: '   ' },
      { row: 0, name: 'Long Link', phone: '9123456783', aadhaar: AADHAAR, photoUrl: `https://example.org/${'a'.repeat(500)}` },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(3);
    expect(res.body.results).toEqual([
      { row: 2, status: 'added' },
      {
        row: 3,
        status: 'invalid',
        errors: { name: MESSAGES.name, phone: MESSAGES.phone, aadhaar: MESSAGES.aadhaar, photoUrl: MESSAGES.photoLink },
      },
      { row: 4, status: 'duplicate', errors: { phone: MESSAGES.duplicate } },
      { row: 6, status: 'added' },
      { row: 9, status: 'duplicate', errors: { phone: MESSAGES.duplicateInSheet } },
      { row: 7, status: 'added' },
      { row: 8, status: 'invalid', errors: { photoUrl: MESSAGES.photoLink } },
    ]);
    const saved = await FederationWorker.find({ federation: f._id, source: 'import' }).sort({ phone: 1 }).lean();
    expect(saved.map((w) => [w.name, w.phone, w.aadhaarLast4, w.photoUrl])).toEqual([
      ['Ravi Kumar', '9123456780', '2346', null],
      ['Meena Bai', '9123456781', '2346', 'https://example.org/meena.jpg'],
      ['Gopal', '9123456782', '2346', null],
    ]);
  });

  test('a phone of a verified app member is a duplicate', async () => {
    const f = await fed();
    await verifiedMember(f, { phone: '9876543210' });
    const res = await importRows(f, [{ row: 2, name: 'Ravi', phone: '9876543210', aadhaar: AADHAAR }]);
    expect(res.body).toEqual({ added: 0, results: [{ row: 2, status: 'duplicate', errors: { phone: MESSAGES.duplicate } }] });
  });

  test('rows that hit the unique index during insert become duplicates', async () => {
    const f = await fed();
    await add(f, manual(f));
    const spy = jest.spyOn(FederationWorker, 'distinct').mockResolvedValueOnce([]);
    const res = await importRows(f, [
      { row: 2, name: 'Asha Devi', phone: '9876543210', aadhaar: AADHAAR },
      { row: 3, name: 'Ravi Kumar', phone: '9123456780', aadhaar: AADHAAR },
    ]);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      added: 1,
      results: [
        { row: 2, status: 'duplicate', errors: { phone: MESSAGES.duplicate } },
        { row: 3, status: 'added' },
      ],
    });
  });

  test.each([
    ['an empty list', [], MESSAGES.emptyImport],
    ['no list', undefined, MESSAGES.emptyImport],
    ['more than 2000 rows', Array.from({ length: 2001 }, () => ({ name: 'Asha', phone: '9876543210', aadhaar: AADHAAR })), MESSAGES.tooManyRows],
  ])('%s is a 400', async (_, rows, message) => {
    const f = await fed();
    const res = await importRows(f, rows);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(await FederationWorker.countDocuments()).toBe(0);
  });

  test('rows that are not objects are a 400', async () => {
    const f = await fed();
    const res = await importRows(f, [{ name: 'Asha', phone: '9876543210', aadhaar: AADHAAR }, 'Ravi']);
    expect(res.status).toBe(400);
    expect(await FederationWorker.countDocuments()).toBe(0);
  });

  test('a 1.5 MB import of 2000 rows is accepted', async () => {
    const f = await fed();
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      row: i + 2,
      name: `Worker${' '.repeat(300)}Kumar`,
      phone: String(9000000000 + i),
      aadhaar: AADHAAR,
      photoUrl: `https://example.org/photos/${'p'.repeat(400)}/${i}.jpg`,
    }));
    const body = JSON.stringify({ rows });
    expect(body.length).toBeGreaterThan(1.5 * 1024 * 1024);
    const res = await request(app)
      .post('/api/federation/me/workers/import')
      .set(as(f, 'Federation'))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2000);
    expect(await FederationWorker.countDocuments({ federation: f._id, status: 'active' })).toBe(2000);
  });
});

describe('listing and removing workers', () => {
  test('the roster lists active workers, newest first', async () => {
    const f = await fed();
    const other = await fed();
    const first = await add(f, manual(f, { name: 'First Worker', phone: '9000000001' }));
    await importRows(f, [{ row: 2, name: 'Second Worker', phone: '9000000002', aadhaar: OTHER_AADHAAR }]);
    const third = await add(f, manual(f, { name: 'Third Worker', phone: '9000000003' }));
    await add(other, manual(other, { name: 'Other Worker' }));
    await request(app).delete(`/api/federation/me/workers/${third.body.worker.id}`).set(as(f, 'Federation'));
    await add(f, manual(f, { name: 'Fourth Worker', phone: '9000000004' }));
    const res = await request(app).get('/api/federation/me/workers').set(as(f, 'Federation'));
    expect(res.status).toBe(200);
    expect(res.body.workers.map((w) => w.name)).toEqual(['Fourth Worker', 'Second Worker', 'First Worker']);
    expect(res.body.workers[1]).toMatchObject({ phone: '9000000002', aadhaar: 'XXXX-XXXX-6783', photoUrl: null, source: 'import' });
    expect(res.body.workers[2]).toEqual({ ...first.body.worker });
  });

  test('a federation removes its own worker but not another federation\'s', async () => {
    const f = await fed();
    const other = await fed();
    const mine = await add(f, manual(f));
    const theirs = await add(other, manual(other));
    const denied = await request(app).delete(`/api/federation/me/workers/${theirs.body.worker.id}`).set(as(f, 'Federation'));
    expect(denied.status).toBe(404);
    expect(denied.body.code).toBe('not_found');
    expect((await FederationWorker.findById(theirs.body.worker.id)).status).toBe('active');
    const res = await request(app).delete(`/api/federation/me/workers/${mine.body.worker.id}`).set(as(f, 'Federation'));
    expect(res.status).toBe(200);
    expect(res.body.worker).toEqual({ id: mine.body.worker.id, status: 'removed' });
    const saved = await FederationWorker.findById(mine.body.worker.id);
    expect(saved.status).toBe('removed');
    expect(saved.removedAt).toBeInstanceOf(Date);
    const twice = await request(app).delete(`/api/federation/me/workers/${mine.body.worker.id}`).set(as(f, 'Federation'));
    expect(twice.status).toBe(404);
    const bad = await request(app).delete('/api/federation/me/workers/not-an-id').set(as(f, 'Federation'));
    expect(bad.status).toBe(404);
  });
});

describe('photo upload signing', () => {
  test('signs uploads into the federation folder', async () => {
    const f = await fed();
    const res = await request(app).post('/api/federation/me/workers/photo/sign').set(as(f, 'Federation'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      apiKey: 'key',
      folder: `sih/federations/${f._id}/workers`,
      timestamp: expect.any(Number),
      signature: expect.any(String),
    });
  });
});

describe('access', () => {
  const endpoints = [
    ['GET', '/api/federation/me/workers'],
    ['POST', '/api/federation/me/workers'],
    ['POST', '/api/federation/me/workers/import'],
    ['POST', '/api/federation/me/workers/photo/sign'],
    ['DELETE', '/api/federation/me/workers/0123456789abcdef01234567'],
  ];
  const call = (method, path) => request(app)[method.toLowerCase()](path);

  test.each(['unverified', 'rejected'])('a %s federation gets 403 on every worker endpoint', async (status) => {
    const f = await fed({ status });
    for (const [method, path] of endpoints) {
      const res = await call(method, path)
        .set(as(f, 'Federation'))
        .send({ ...manual(f), rows: [{ name: 'Asha', phone: '9876543210', aadhaar: AADHAAR }] });
      expect([method, path, res.status, res.body.code]).toEqual([method, path, 403, 'federation_unverified']);
    }
    expect(await FederationWorker.countDocuments()).toBe(0);
  });

  test('app and government tokens get 403 on every worker endpoint', async () => {
    const user = await createUser();
    for (const [method, path] of endpoints) {
      const asApp = await call(method, path).set(authHeader(user));
      expect([method, path, asApp.status]).toEqual([method, path, 403]);
      const asGov = await call(method, path).set(as({ _id: user._id }, 'GovOfficial'));
      expect([method, path, asGov.status]).toEqual([method, path, 403]);
    }
  });
});

describe('member counts', () => {
  async function seedCounts(f) {
    await verifiedMember(f);
    const pending = await createUser();
    await FederationMembership.create({ user: pending._id, federation: f._id, status: 'pending' });
    await add(f, manual(f, { phone: '9000000001' }));
    await importRows(f, [{ row: 2, name: 'Imported Worker', phone: '9000000002', aadhaar: AADHAAR }]);
    const removed = await add(f, manual(f, { phone: '9000000003' }));
    await request(app).delete(`/api/federation/me/workers/${removed.body.worker.id}`).set(as(f, 'Federation'));
  }

  test('check-email counts verified app members and active roster workers', async () => {
    const f = await fed();
    await seedCounts(f);
    const res = await request(app).get(`/api/federation/check-email/${f.email}`).set(as(f, 'Federation'));
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(3);
  });

  test('nearby federations count roster workers', async () => {
    const f = await fed();
    await seedCounts(f);
    const rosterOnly = await fed();
    await add(rosterOnly, manual(rosterOnly));
    const w = await createUser({ name: 'Ravi', isWorker: true, city: 'Pune', pincode: '411001' });
    const res = await request(app).get('/api/federations/nearby').set(authHeader(w));
    expect(res.status).toBe(200);
    const counts = Object.fromEntries(res.body.federations.map((x) => [x.id, x.memberCount]));
    expect(counts).toEqual({ [String(f._id)]: 3, [String(rosterOnly._id)]: 1 });
  });

  test('the government list carries each federation\'s member count', async () => {
    const f = await fed();
    await seedCounts(f);
    const empty = await fed({ status: 'unverified' });
    const res = await request(app).get('/api/federation/all').set(as({ _id: f._id }, 'GovOfficial'));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.federations.map((x) => [x._id, x]));
    expect(byId[String(f._id)]).toMatchObject({ name: f.name, email: f.email, memberCount: 3 });
    expect(byId[String(empty._id)].memberCount).toBe(0);
  });
});

test('worker requests include phone, masked Aadhaar and the Google photo', async () => {
  const f = await fed();
  const withDetails = await createUser({
    name: 'Asha',
    isWorker: true,
    phone: '9876543210',
    aadhaarNumber: '1234',
    googleAvatar: 'https://lh3.googleusercontent.com/a/asha',
  });
  const without = await createUser({ name: 'Ravi', isWorker: true });
  await FederationMembership.create({ user: withDetails._id, federation: f._id, status: 'pending', requestedAt: new Date(Date.now() - 1000) });
  await FederationMembership.create({ user: without._id, federation: f._id, status: 'pending' });
  const res = await request(app).get('/api/federation/me/requests').set(as(f, 'Federation'));
  expect(res.status).toBe(200);
  expect(res.body.requests.map((r) => r.worker)).toEqual([
    expect.objectContaining({ name: 'Asha', phone: '9876543210', aadhaar: 'XXXX-XXXX-1234', photoUrl: 'https://lh3.googleusercontent.com/a/asha' }),
    expect.objectContaining({ name: 'Ravi', phone: null, aadhaar: null, photoUrl: null }),
  ]);
});
