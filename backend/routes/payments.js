const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const PayoutAccount = require('../models/PayoutAccount');
const verifyToken = require('../middleware/verifyToken');
const { sendError, splitFieldErrors } = require('../services/errors');
const {
  confirmOnlinePayment,
  ensurePayment,
  ensureReceipt,
  isPayable,
  markPaid,
  settlePendingPayouts,
  toPayment,
} = require('../services/payment');
const { payoutInfo, savePayoutAccount, toPayoutAccount, validatePayoutAccount } = require('../services/payout');
const razorpay = require('../services/razorpay');
const { renderReceiptPdf } = require('../services/receipt');

const router = express.Router();

const RECEIPT_LINK_TTL = '15m';
const EARNINGS_LIMIT = 50;

/**
 * Loads a completed job's Payment for the client or the assigned worker
 * (`as` narrows it to one of them). Sends the error and returns null when
 * the caller can't see it.
 */
async function loadPayment(req, res, as) {
  const { jobId } = req.params;
  if (!mongoose.isValidObjectId(jobId)) {
    sendError(res, 404, 'job_not_found', 'Job not found');
    return null;
  }
  const job = await Job.findById(jobId);
  const me = String(req.user._id);
  const role = job && (String(job.client) === me ? 'client' : String(job.assignedWorker) === me ? 'worker' : null);
  if (!job || !role || (as && role !== as)) {
    sendError(res, 404, 'job_not_found', 'Job not found');
    return null;
  }
  if (!isPayable(job)) {
    sendError(res, 409, 'payment_job_not_completed', 'You can pay once the job is completed.');
    return null;
  }
  return ensureReceipt(await ensurePayment(job));
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/jobs/:jobId
// The payment for a completed job, for its client or assigned worker.
// ────────────────────────────────────────────────────────────────────────────
router.get('/jobs/:jobId', verifyToken, async (req, res) => {
  try {
    const payment = await loadPayment(req, res);
    if (!payment) return undefined;
    return res.status(200).json(toPayment(payment, req.user._id));
  } catch (err) {
    console.error('Payment load error:', err.message);
    return sendError(res, 500, 'payment_load_failed', 'Could not load the payment.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/jobs/:jobId/order
// Client: opens (or reuses) the Razorpay order to pay for a completed job.
// → { keyId, orderId, amount (paise), currency, prefill }  for Checkout
// ────────────────────────────────────────────────────────────────────────────
router.post('/jobs/:jobId/order', verifyToken, async (req, res) => {
  if (!razorpay.isConfigured()) {
    return sendError(res, 503, 'payments_not_configured', 'Online payments aren’t set up yet.');
  }
  try {
    let payment = await loadPayment(req, res, 'client');
    if (!payment) return undefined;
    if (payment.status === 'PAID') {
      return sendError(res, 409, 'payment_already_paid', 'This job is already paid for.');
    }

    if (!payment.razorpay.orderId) {
      const order = await razorpay.createOrder({
        amountPaise: payment.amountPaise,
        receipt: String(payment._id),
        notes: { job: String(payment.job) },
      });
      // Two taps at once can create two orders — keep whichever saved first.
      payment =
        (await Payment.findOneAndUpdate(
          { _id: payment._id, 'razorpay.orderId': null },
          { 'razorpay.orderId': order.id },
          { new: true }
        )) ?? (await Payment.findById(payment._id));
    }

    const user = req.user;
    return res.status(200).json({
      keyId: razorpay.keyId(),
      orderId: payment.razorpay.orderId,
      amount: payment.amountPaise,
      currency: payment.currency,
      prefill: { name: user.name ?? '', email: user.googleEmail ?? '', contact: user.phone ?? '' },
    });
  } catch (err) {
    console.error('Payment order error:', razorpay.errorText(err));
    return sendError(res, 502, 'payment_order_failed', 'Could not start the payment. Please try again.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/jobs/:jobId/verify
// Client: Checkout succeeded. Body: { orderId, paymentId, signature }
// The webhook confirms the same payment too; whichever arrives first wins.
// ────────────────────────────────────────────────────────────────────────────
router.post('/jobs/:jobId/verify', verifyToken, async (req, res) => {
  const { orderId, paymentId, signature } = req.body ?? {};
  try {
    const payment = await loadPayment(req, res, 'client');
    if (!payment) return undefined;
    if (payment.status === 'PAID') return res.status(200).json(toPayment(payment, req.user._id));

    if (
      typeof paymentId !== 'string' ||
      orderId !== payment.razorpay.orderId ||
      !razorpay.verifyPaymentSignature(orderId, paymentId, signature)
    ) {
      return sendError(res, 400, 'payment_verification_failed', 'We couldn’t verify this payment.');
    }

    const paid = await confirmOnlinePayment(payment, paymentId);
    return res.status(200).json(toPayment(paid, req.user._id));
  } catch (err) {
    if (err.code === 'payment_mismatch' || err.code === 'payment_not_completed') {
      return sendError(res, 400, 'payment_verification_failed', 'We couldn’t verify this payment.');
    }
    console.error('Payment verify error:', razorpay.errorText(err));
    return sendError(res, 502, 'payment_verify_failed', 'Could not confirm the payment. Please check again shortly.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/jobs/:jobId/cash
// Assigned worker: "I received the payment in cash." Only the worker can
// say this — they're the one who'd lose out if it weren't true.
// ────────────────────────────────────────────────────────────────────────────
router.post('/jobs/:jobId/cash', verifyToken, async (req, res) => {
  try {
    const payment = await loadPayment(req, res, 'worker');
    if (!payment) return undefined;
    if (payment.status === 'PAID') {
      return sendError(res, 409, 'payment_already_paid', 'This job is already paid for.');
    }
    const paid = (await markPaid(payment._id, { method: 'cash' })) ?? (await Payment.findById(payment._id));
    return res.status(200).json(toPayment(paid, req.user._id));
  } catch (err) {
    console.error('Cash payment error:', err.message);
    return sendError(res, 500, 'payment_update_failed', 'Could not record the payment.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/:id/receipt-link
// A short-lived link to the receipt PDF, for the client or worker — the app
// opens it in the browser, where it can be saved or shared.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:id/receipt-link', verifyToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 404, 'receipt_not_found', 'Receipt not found');
  }
  try {
    const me = req.user._id;
    const payment = await Payment.findOne({ _id: req.params.id, $or: [{ client: me }, { worker: me }] });
    if (!payment || payment.status !== 'PAID') {
      return sendError(res, 404, 'receipt_not_found', 'Receipt not found');
    }
    // `receipt` (not `userId`) means this token can't be used to sign in.
    const token = jwt.sign({ receipt: String(payment._id) }, process.env.JWT_SECRET, {
      expiresIn: RECEIPT_LINK_TTL,
    });
    const base = process.env.PUBLIC_API_URL
      ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/payments`
      : `${req.protocol}://${req.get('host')}${req.baseUrl}`;
    return res.status(200).json({ url: `${base}/receipt.pdf?token=${encodeURIComponent(token)}` });
  } catch (err) {
    console.error('Receipt link error:', err.message);
    return sendError(res, 500, 'receipt_failed', 'Could not open the receipt.');
  }
});

// GET /api/payments/receipt.pdf?token=… — the PDF, authorised by the link token.
router.get('/receipt.pdf', async (req, res) => {
  let claims;
  try {
    claims = jwt.verify(String(req.query.token ?? ''), process.env.JWT_SECRET);
  } catch {
    return sendError(res, 401, 'receipt_link_expired', 'This receipt link has expired. Open it again from the app.');
  }
  if (!claims.receipt || !mongoose.isValidObjectId(claims.receipt)) {
    return sendError(res, 401, 'receipt_link_expired', 'This receipt link has expired. Open it again from the app.');
  }
  try {
    const payment = await ensureReceipt(await Payment.findById(claims.receipt));
    if (!payment || payment.status !== 'PAID') {
      return sendError(res, 404, 'receipt_not_found', 'Receipt not found');
    }
    const pdf = await renderReceiptPdf(payment);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${payment.receipt.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    return res.status(200).send(pdf);
  } catch (err) {
    console.error('Receipt render error:', err.message);
    return sendError(res, 500, 'receipt_failed', 'Could not open the receipt.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/earnings
// Worker: payments for their recent completed jobs, and totals.
// ────────────────────────────────────────────────────────────────────────────
router.get('/earnings', verifyToken, async (req, res) => {
  const me = req.user._id;
  try {
    await settlePendingPayouts(me); // anything past its hold goes out now

    const jobs = await Job.find({ assignedWorker: me, status: 'COMPLETED' })
      .sort({ completedAt: -1 })
      .limit(EARNINGS_LIMIT);
    const have = new Set(
      (await Payment.find({ job: { $in: jobs.map((j) => j._id) } }).select('job').lean()).map((p) => String(p.job))
    );
    await Promise.all(jobs.filter((j) => !have.has(String(j._id))).map(ensurePayment));

    const payments = await Payment.find({ worker: me }).sort({ createdAt: -1 }).limit(EARNINGS_LIMIT);
    const totals = { received: 0, onTheWay: 0, awaitingClient: 0 };
    for (const p of payments) {
      const share = p.method === 'cash' ? p.amountPaise : p.workerAmountPaise;
      if (p.status === 'PENDING') totals.awaitingClient += p.amountPaise;
      else if (p.payout.status === 'SETTLED' || p.payout.status === 'NOT_APPLICABLE') totals.received += share;
      else totals.onTheWay += share;
    }

    const account = await PayoutAccount.findOne({ worker: me });
    return res.status(200).json({
      totals: {
        received: totals.received / 100,
        onTheWay: totals.onTheWay / 100,
        awaitingClient: totals.awaitingClient / 100,
      },
      payoutAccount: toPayoutAccount(account),
      payouts: payoutInfo(),
      payments: payments.map((p) => toPayment(p, me)),
    });
  } catch (err) {
    console.error('Earnings error:', err.message);
    return sendError(res, 500, 'earnings_load_failed', 'Could not load your earnings.');
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/payout-account   → { account (or null), payouts: { mode, testMode, testBank } }
// PUT /api/payments/payout-account   Body: { holderName, accountNumber,
//                                            confirmAccountNumber, ifsc }
// ────────────────────────────────────────────────────────────────────────────
router.get('/payout-account', verifyToken, async (req, res) => {
  try {
    const account = await PayoutAccount.findOne({ worker: req.user._id });
    return res.status(200).json({ account: toPayoutAccount(account), payouts: payoutInfo() });
  } catch (err) {
    console.error('Payout account load error:', err.message);
    return sendError(res, 500, 'payout_account_load_failed', 'Could not load your bank details.');
  }
});

router.put('/payout-account', verifyToken, async (req, res) => {
  if (!req.user.isWorker) {
    return sendError(res, 403, 'payout_worker_only', 'Register as a worker to add bank details.');
  }
  try {
    const { bank, errors } = await validatePayoutAccount(req.body);
    if (Object.keys(errors).length > 0) {
      const { fields, fieldCodes, fieldParams } = splitFieldErrors(errors);
      return res.status(400).json({
        error: 'Please fix the highlighted fields.',
        code: 'validation',
        fields,
        fieldCodes,
        fieldParams,
      });
    }
    const account = await savePayoutAccount(req.user, bank);
    return res.status(200).json({ account: toPayoutAccount(account) });
  } catch (err) {
    if (err.code && err.status) return sendError(res, err.status, err.code, err.message);
    console.error('Payout account save error:', err.message);
    return sendError(res, 500, 'payout_account_save_failed', 'Could not save your bank details.');
  }
});

module.exports = router;
