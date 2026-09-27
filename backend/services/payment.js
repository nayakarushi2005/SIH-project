/**
 * Paying for a completed job: what the client owes, taking the money (online
 * through Razorpay, or cash the worker confirms), the worker's payout, and
 * receipt numbers. Routes live in routes/payments.js and routes/webhooks.js.
 *
 * Env:
 *   PLATFORM_FEE_PERCENT      — platform's cut of online payments (default 0)
 *   PAYOUT_MODE               — 'simulated' (default) records payouts without
 *                               moving money; 'route' transfers through
 *                               Razorpay Route linked accounts
 *   PAYOUT_CHANGE_HOLD_HOURS  — payouts wait this long after bank details
 *                               change (default 24)
 */

const Counter = require('../models/Counter');
const Payment = require('../models/Payment');
const PayoutAccount = require('../models/PayoutAccount');
const User = require('../models/User');
const razorpay = require('./razorpay');

function platformFeePercent() {
  const pct = Number(process.env.PLATFORM_FEE_PERCENT);
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : 0;
}

function payoutMode() {
  return process.env.PAYOUT_MODE === 'route' ? 'route' : 'simulated';
}

/** Splits a job's price (whole rupees) into paise for the client, platform and worker. */
function amountsFor(job) {
  const amountPaise = Math.round(job.price * 100);
  const platformFeePaise = Math.round((amountPaise * platformFeePercent()) / 100);
  return { amountPaise, platformFeePaise, workerAmountPaise: amountPaise - platformFeePaise };
}

/** Whether a job can be paid for: done, and had a worker. */
function isPayable(job) {
  return job.status === 'COMPLETED' && !!job.assignedWorker;
}

/**
 * The Payment for a completed job, created on first call. Safe to call
 * concurrently — the unique index on `job` keeps it to one.
 */
async function ensurePayment(job) {
  const existing = await Payment.findOne({ job: job._id });
  if (existing) return existing;

  const [client, worker] = await Promise.all([
    User.findById(job.client).select('name googleEmail').lean(),
    User.findById(job.assignedWorker).select('name').lean(),
  ]);
  try {
    return await Payment.findOneAndUpdate(
      { job: job._id },
      {
        $setOnInsert: {
          job: job._id,
          client: job.client,
          worker: job.assignedWorker,
          ...amountsFor(job),
          snapshot: {
            category: job.category,
            description: job.description,
            clientName: client?.name ?? client?.googleEmail ?? null,
            workerName: worker?.name ?? null,
            completedAt: job.completedAt,
          },
        },
      },
      { new: true, upsert: true }
    );
  } catch (err) {
    if (err.code === 11000) return Payment.findOne({ job: job._id }); // lost the race
    throw err;
  }
}

/** Gives a PAID payment its receipt number, once. */
async function ensureReceipt(payment) {
  if (payment.status !== 'PAID' || payment.receipt?.number) return payment;
  const year = (payment.paidAt ?? new Date()).getFullYear();
  const seq = await Counter.next(`receipt-${year}`);
  const number = `RCPT-${year}-${String(seq).padStart(6, '0')}`;
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, 'receipt.number': null },
    { receipt: { number, issuedAt: new Date() } },
    { new: true }
  );
  return updated ?? Payment.findById(payment._id);
}

/**
 * PENDING → PAID. Returns the updated payment, or null if it was already paid
 * (a repeated webhook, or verify and webhook both arriving).
 */
async function markPaid(paymentId, { method, razorpayPaymentId = null, razorpayMethod = null }) {
  const paid = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'PENDING' },
    {
      status: 'PAID',
      method,
      paidAt: new Date(),
      lastFailure: null,
      'razorpay.paymentId': razorpayPaymentId,
      'razorpay.method': razorpayMethod,
      // Cash went straight to the worker — nothing to pay out.
      'payout.status': method === 'cash' ? 'NOT_APPLICABLE' : 'PENDING',
    },
    { new: true }
  );
  return paid ? ensureReceipt(paid) : null;
}

/**
 * Checks a Razorpay payment really is for this Payment and for the full
 * amount, captures it if it's only authorized, and marks the Payment PAID.
 * Throws { code } when the Razorpay payment doesn't belong here or failed.
 */
async function confirmOnlinePayment(payment, razorpayPaymentId) {
  const rp = await razorpay.fetchPayment(razorpayPaymentId);
  if (rp.order_id !== payment.razorpay.orderId || Number(rp.amount) !== payment.amountPaise) {
    throw { code: 'payment_mismatch' };
  }
  if (rp.status === 'authorized') {
    await razorpay.capturePayment(rp.id, payment.amountPaise);
  } else if (rp.status !== 'captured') {
    throw { code: 'payment_not_completed' };
  }

  const paid = await markPaid(payment._id, {
    method: 'online',
    razorpayPaymentId: rp.id,
    razorpayMethod: rp.method ?? null,
  });
  if (!paid) {
    const current = await Payment.findById(payment._id);
    if (current.method === 'cash') {
      // The worker confirmed cash, then the client paid online as well.
      console.error(`Payment ${payment._id}: paid online after cash — refund ${rp.id} manually.`);
    }
    return current;
  }
  settlePayout(paid).catch((err) => console.error(`Payout for ${paid._id} failed:`, err.message));
  return paid;
}

/**
 * Pays the worker their share of a PAID online payment, if they have an
 * active payout account and no change cooldown. Otherwise leaves it PENDING
 * for settlePendingPayouts to pick up later.
 */
async function settlePayout(payment) {
  const account = await PayoutAccount.findOne({ worker: payment.worker, status: 'ACTIVE' });
  if (!account) return payment;
  if (account.holdPayoutsUntil && account.holdPayoutsUntil > new Date()) return payment;

  // Claim it, so two callers can't both send the transfer.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'PAID', 'payout.status': { $in: ['PENDING', 'FAILED'] } },
    { 'payout.status': 'PROCESSING', 'payout.error': null },
    { new: true }
  );
  if (!claimed) return payment;

  const mode = account.mode;
  try {
    let transferId = null;
    if (mode === 'route') {
      const transfer = await razorpay.transferToLinkedAccount(
        claimed.razorpay.paymentId,
        account.razorpayAccountId,
        claimed.workerAmountPaise,
        { job: String(claimed.job) }
      );
      transferId = transfer.id;
    }
    return await Payment.findByIdAndUpdate(
      claimed._id,
      {
        'payout.status': 'SETTLED',
        'payout.mode': mode,
        'payout.transferId': transferId,
        'payout.accountLast4': account.accountLast4,
        'payout.settledAt': new Date(),
      },
      { new: true }
    );
  } catch (err) {
    const reason = razorpay.errorText(err);
    console.error(`Payout for payment ${claimed._id} failed:`, reason);
    return Payment.findByIdAndUpdate(
      claimed._id,
      { 'payout.status': 'FAILED', 'payout.mode': mode, 'payout.error': reason },
      { new: true }
    );
  }
}

/** Retries every unsettled payout — for one worker, or everyone. */
async function settlePendingPayouts(workerId) {
  const filter = { status: 'PAID', 'payout.status': { $in: ['PENDING', 'FAILED'] } };
  if (workerId) filter.worker = workerId;
  const due = await Payment.find(filter).limit(100);
  for (const payment of due) {
    await settlePayout(payment);
  }
}

/** What the app sees of a payment. The worker also sees their share and payout. */
function toPayment(payment, viewerId) {
  const isWorker = String(payment.worker) === String(viewerId);
  return {
    id: payment._id,
    jobId: payment.job,
    status: payment.status,
    method: payment.method,
    amount: payment.amountPaise / 100,
    currency: payment.currency,
    paidAt: payment.paidAt,
    lastFailure: payment.status === 'PENDING' ? payment.lastFailure : null,
    receiptNumber: payment.receipt?.number ?? null,
    category: payment.snapshot?.category ?? null,
    description: payment.snapshot?.description ?? null,
    clientName: payment.snapshot?.clientName ?? null,
    workerName: payment.snapshot?.workerName ?? null,
    completedAt: payment.snapshot?.completedAt ?? null,
    ...(isWorker
      ? {
          platformFee: payment.platformFeePaise / 100,
          workerAmount: payment.workerAmountPaise / 100,
          payout: {
            status: payment.payout.status,
            accountLast4: payment.payout.accountLast4,
            settledAt: payment.payout.settledAt,
            simulated: payment.payout.mode === 'simulated',
          },
        }
      : {}),
  };
}

module.exports = {
  amountsFor,
  confirmOnlinePayment,
  ensurePayment,
  ensureReceipt,
  isPayable,
  markPaid,
  payoutMode,
  settlePayout,
  settlePendingPayouts,
  toPayment,
};
