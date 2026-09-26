const request = require('supertest');
const app = require('../app');

test('GET /api/health responds ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
