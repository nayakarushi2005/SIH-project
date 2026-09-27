const crypto = require('crypto');
const request = require('supertest');

jest.mock('../services/razorpay', () => {
  const actual = jest.requireActual('../services/razorpay');
  return {
    ...actual,
    isConfigured: jest.fn(() => true),
    keyId: jest.fn(() => 'rzp_test_key'),
    createOrder: jest.fn(),
    fetchPayment: jest.fn(),
    capturePayment: jest.fn(),
    transferToLinkedAccount: jest.fn(),
    createLinkedAccount: jest.fn(),
    lookupIfsc: jest.fn(),
  };
});

const db = require('./setup');
const app = require('../app');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const PayoutAccount = require('../models/PayoutAccount');
const razorpay = require('../services/razorpay');
const { settlePendingPayouts } = require('../services/payment');
const { createUser, authHeader } = require('./helpers');

process.env.RAZORPAY_KEY_SECRET = 'key-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'hook-secret';

beforeAll(db.connect);
afterEach(async () => {
  await db.clear();
  jest.clearAllMocks();
  delete process.env.PLATFORM_FEE_PERCENT;
  delete process.env.PAYOUT_MODE;
});
afterAll(db.close);

const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

async function completedJob(overrides = {}) {
  const client = await createUser({ name: 'Asha Client', phone: '9876543210' });
  const worker = await createUser({ name: 'Ravi Worker', isWorker: true, phone: '9123456780', pincode: '400001' });
  const job = await Job.create({
    client: client._id,
    category: 'plumber',
    description: 'Fix a leaking tap in the kitchen',
    photos: ['https://example.com/photo.jpg'],
    price: 500,
    expectedDurationMins: 60,
    location: { type: 'Point', coordinates: [72.8, 19.1] },
    clientAadhaarVerified: true,
    status: 'COMPLETED',
    assignedWorker: worker._id,
    completedAt: new Date(),
    ...overrides,
  });
  return { client, worker, job };
}

const BANK = {
  holderName: 'Ravi Worker',
  accountNumber: '123456789012',
  confirmAccountNumber: '123456789012',
  ifsc: 'sbin0001234',
};

describe('GET /api/payments/jobs/:jobId', () => {
  test('creates a PENDING payment for a completed job, with the fee taken from the worker share', async () => {
    process.env.PLATFORM_FEE_PERCENT = '10';
    const { client, worker, job } = await completedJob();

    const asClient = await request(app).get(`/api/payments/jobs/${job._id}`).set(authHeader(client));
    expect(asClient.status).toBe(200);
    expect(asClient.body).toMatchObject({ status: 'PENDING', amount: 500, method: null, receiptNumber: null });
    expect(asClient.body.workerAmount).toBeUndefined(); // the client doesn't see the split

    const asWorker = await request(app).get(`/api/payments/jobs/${job._id}`).set(authHeader(worker));
    expect(asWorker.body).toMatchObject({ amount: 500, platformFee: 50, workerAmount: 450 });
    expect(await Payment.countDocuments()).toBe(1);
  });

  test('a job that is not completed cannot be paid for', async () => {
    const { client, job } = await completedJob({ status: 'IN_PROGRESS', completedAt: null });
    const res = await request(app).get(`/api/payments/jobs/${job._id}`).set(authHeader(client));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('payment_job_not_completed');
  });

  test('someone else cannot see the payment', async () => {
    const { job } = await completedJob();
    const stranger = await createUser();
    const res = await request(app).get(`/api/payments/jobs/${job._id}`).set(authHeader(stranger));
    expect(res.status).toBe(404);
  });
});

describe('online payment', () => {
  test('order → verify marks the payment PAID with a receipt number, and captures an authorized payment', async () => {
    const { client, job } = await completedJob();
    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });

    const order = await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    expect(order.status).toBe(200);
    expect(order.body).toMatchObject({ keyId: 'rzp_test_key', orderId: 'order_1', amount: 50000, currency: 'INR' });
    expect(razorpay.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 50000 }));

    // A second tap reuses the same order.
    const again = await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    expect(again.body.orderId).toBe('order_1');
    expect(razorpay.createOrder).toHaveBeenCalledTimes(1);

    razorpay.fetchPayment.mockResolvedValue({
      id: 'pay_1', order_id: 'order_1', amount: 50000, status: 'authorized', method: 'upi',
    });
    const res = await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1', 'key-secret') });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PAID', method: 'online' });
    expect(res.body.receiptNumber).toMatch(/^RCPT-\d{4}-000001$/);
    expect(razorpay.capturePayment).toHaveBeenCalledWith('pay_1', 50000);
  });

  test('a capture that loses the race to auto-capture still counts as paid', async () => {
    const { client, job } = await completedJob();
    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));

    const entity = { id: 'pay_1', order_id: 'order_1', amount: 50000, method: 'upi' };
    razorpay.fetchPayment
      .mockResolvedValueOnce({ ...entity, status: 'authorized' })
      .mockResolvedValueOnce({ ...entity, status: 'captured' });
    razorpay.capturePayment.mockRejectedValue({ error: { description: 'This payment has already been captured' } });

    const res = await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1', 'key-secret') });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
  });

  test('a bad signature is rejected and nothing is paid', async () => {
    const { client, job } = await completedJob();
    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));

    const res = await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: 'forged' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('payment_verification_failed');
    expect((await Payment.findOne()).status).toBe('PENDING');
  });

  test('a payment for a smaller amount is not accepted', async () => {
    const { client, job } = await completedJob();
    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', amount: 100, status: 'captured' });

    const res = await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1', 'key-secret') });

    expect(res.status).toBe(400);
    expect((await Payment.findOne()).status).toBe('PENDING');
  });

  test('the worker cannot open an order for their own job', async () => {
    const { worker, job } = await completedJob();
    const res = await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(worker));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/webhooks/razorpay', () => {
  async function pendingWithOrder() {
    const { client, worker, job } = await completedJob();
    razorpay.createOrder.mockResolvedValue({ id: 'order_9' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    return { client, worker, job };
  }

  function post(body, secret = 'hook-secret') {
    const raw = JSON.stringify(body);
    return request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sign(raw, secret))
      .send(raw);
  }

  const captured = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9', amount: 50000, status: 'captured', method: 'card' } } },
  };

  test('payment.captured marks the payment PAID, and a repeat is harmless', async () => {
    await pendingWithOrder();
    razorpay.fetchPayment.mockResolvedValue(captured.payload.payment.entity);

    expect((await post(captured)).status).toBe(200);
    expect((await post(captured)).status).toBe(200);

    const payment = await Payment.findOne();
    expect(payment.status).toBe('PAID');
    expect(payment.razorpay).toMatchObject({ paymentId: 'pay_9', method: 'card' });
    expect(payment.receipt.number).toMatch(/000001$/);
    expect(razorpay.capturePayment).not.toHaveBeenCalled();
  });

  test('a wrong signature is rejected', async () => {
    await pendingWithOrder();
    const res = await post(captured, 'not-the-secret');
    expect(res.status).toBe(400);
    expect((await Payment.findOne()).status).toBe('PENDING');
  });

  test('payment.failed records why, and the payment stays payable', async () => {
    await pendingWithOrder();
    await post({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_x', order_id: 'order_9', error_description: 'Bank declined' } } },
    });
    const payment = await Payment.findOne();
    expect(payment.status).toBe('PENDING');
    expect(payment.lastFailure).toBe('Bank declined');
  });
});

describe('cash', () => {
  test('only the assigned worker can confirm cash; it needs no payout', async () => {
    const { client, worker, job } = await completedJob();

    const byClient = await request(app).post(`/api/payments/jobs/${job._id}/cash`).set(authHeader(client));
    expect(byClient.status).toBe(404);

    const res = await request(app).post(`/api/payments/jobs/${job._id}/cash`).set(authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PAID', method: 'cash' });
    expect(res.body.payout.status).toBe('NOT_APPLICABLE');
    expect(res.body.receiptNumber).toBeTruthy();

    const twice = await request(app).post(`/api/payments/jobs/${job._id}/cash`).set(authHeader(worker));
    expect(twice.status).toBe(409);
  });
});

describe('payout account', () => {
  test('saves bank details without keeping the full account number, and pays out waiting earnings', async () => {
    const { client, worker, job } = await completedJob();
    razorpay.lookupIfsc.mockResolvedValue({ bank: 'State Bank of India', branch: 'Fort', city: 'Mumbai', state: 'Maharashtra' });

    // Paid online before the worker had an account: the payout waits.
    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', amount: 50000, status: 'captured' });
    await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1', 'key-secret') });
    expect((await Payment.findOne()).payout.status).toBe('PENDING');

    const res = await request(app).put('/api/payments/payout-account').set(authHeader(worker)).send(BANK);
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({
      holderName: 'Ravi Worker', ifsc: 'SBIN0001234', bankName: 'State Bank of India', accountLast4: '9012',
    });
    const stored = await PayoutAccount.findOne().lean();
    expect(JSON.stringify(stored)).not.toContain('123456789012');

    await settlePendingPayouts(worker._id);
    const payment = await Payment.findOne();
    expect(payment.payout).toMatchObject({ status: 'SETTLED', mode: 'simulated', accountLast4: '9012' });
  });

  test('changing bank details holds payouts for a while', async () => {
    const { worker } = await completedJob();
    razorpay.lookupIfsc.mockResolvedValue({ bank: 'SBI' });
    await request(app).put('/api/payments/payout-account').set(authHeader(worker)).send(BANK);
    const first = await PayoutAccount.findOne();
    expect(first.holdPayoutsUntil).toBeNull();

    const res = await request(app)
      .put('/api/payments/payout-account')
      .set(authHeader(worker))
      .send({ ...BANK, accountNumber: '999988887777', confirmAccountNumber: '999988887777' });
    expect(res.body.account.holdPayoutsUntil).toBeTruthy();
  });

  test('bad details come back as coded field errors', async () => {
    const { worker } = await completedJob();
    razorpay.lookupIfsc.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/payments/payout-account')
      .set(authHeader(worker))
      .send({ holderName: 'R', accountNumber: '12ab', confirmAccountNumber: '', ifsc: 'SBIN0009999' });
    expect(res.status).toBe(400);
    expect(res.body.fieldCodes).toEqual({
      holderName: 'payout_holder_name_invalid',
      accountNumber: 'payout_account_number_invalid',
      ifsc: 'payout_ifsc_not_found',
    });
  });

  test('mismatched confirmation is caught', async () => {
    const { worker } = await completedJob();
    razorpay.lookupIfsc.mockResolvedValue({ bank: 'SBI' });
    const res = await request(app)
      .put('/api/payments/payout-account')
      .set(authHeader(worker))
      .send({ ...BANK, confirmAccountNumber: '123456789013' });
    expect(res.body.fieldCodes).toEqual({ confirmAccountNumber: 'payout_account_number_mismatch' });
  });

  test('route mode creates a linked account and transfers the worker share', async () => {
    process.env.PAYOUT_MODE = 'route';
    process.env.PLATFORM_FEE_PERCENT = '10';
    const { client, worker, job } = await completedJob();
    razorpay.lookupIfsc.mockResolvedValue({ bank: 'SBI', state: 'Maharashtra', city: 'Mumbai' });
    razorpay.createLinkedAccount.mockResolvedValue('acc_123');
    razorpay.transferToLinkedAccount.mockResolvedValue({ id: 'trf_1' });

    await request(app).put('/api/payments/payout-account').set(authHeader(worker)).send(BANK);
    expect(razorpay.createLinkedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '9123456780', bank: expect.objectContaining({ ifsc: 'SBIN0001234' }) })
    );

    razorpay.createOrder.mockResolvedValue({ id: 'order_1' });
    await request(app).post(`/api/payments/jobs/${job._id}/order`).set(authHeader(client));
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', amount: 50000, status: 'captured' });
    await request(app)
      .post(`/api/payments/jobs/${job._id}/verify`)
      .set(authHeader(client))
      .send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1', 'key-secret') });

    await settlePendingPayouts(worker._id);
    expect(razorpay.transferToLinkedAccount).toHaveBeenCalledTimes(1);
    expect(razorpay.transferToLinkedAccount).toHaveBeenCalledWith('pay_1', 'acc_123', 45000, expect.anything());
    expect((await Payment.findOne()).payout).toMatchObject({ status: 'SETTLED', transferId: 'trf_1' });
  });
});

describe('receipts and earnings', () => {
  test('a receipt link opens the PDF, and the link token cannot be used to sign in', async () => {
    const { client, worker, job } = await completedJob();
    await request(app).post(`/api/payments/jobs/${job._id}/cash`).set(authHeader(worker));
    const payment = await Payment.findOne();

    const link = await request(app).get(`/api/payments/${payment._id}/receipt-link`).set(authHeader(client));
    expect(link.status).toBe(200);
    const url = new URL(link.body.url);

    const pdf = await request(app).get(`${url.pathname}${url.search}`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const token = url.searchParams.get('token');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  test('an unpaid job has no receipt', async () => {
    const { client, job } = await completedJob();
    await request(app).get(`/api/payments/jobs/${job._id}`).set(authHeader(client));
    const payment = await Payment.findOne();
    const res = await request(app).get(`/api/payments/${payment._id}/receipt-link`).set(authHeader(client));
    expect(res.status).toBe(404);
  });

  test('earnings list every completed job and total what the worker has and is owed', async () => {
    const { worker, job } = await completedJob();
    const other = await Job.create({ ...job.toObject(), _id: undefined, price: 300 });
    await request(app).post(`/api/payments/jobs/${job._id}/cash`).set(authHeader(worker));

    const res = await request(app).get('/api/payments/earnings').set(authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.totals).toEqual({ received: 500, onTheWay: 0, awaitingClient: 300 });
    expect(res.body.payoutAccount).toBeNull();
    expect(other).toBeTruthy();
  });
});
