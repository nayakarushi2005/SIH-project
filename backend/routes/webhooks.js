const express = require('express');
const Payment = require('../models/Payment');
const { confirmOnlinePayment } = require('../services/payment');
const razorpay = require('../services/razorpay');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/razorpay
// Razorpay's server-to-server events — the source of truth for payments,
// covering a client who paid but closed the app before /verify ran.
// Mounted before express.json(): the signature is over the raw body.
// Razorpay retries anything that isn't 2xx, and every handler is idempotent.
// ────────────────────────────────────────────────────────────────────────────
router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!razorpay.verifyWebhookSignature(raw, req.get('X-Razorpay-Signature'))) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const entity = event.payload?.payment?.entity;
  try {
    if (entity?.order_id && ['payment.authorized', 'payment.captured', 'order.paid'].includes(event.event)) {
      const payment = await Payment.findOne({ 'razorpay.orderId': entity.order_id });
      if (payment && payment.status === 'PENDING') await confirmOnlinePayment(payment, entity.id);
    } else if (entity?.order_id && event.event === 'payment.failed') {
      await Payment.updateOne(
        { 'razorpay.orderId': entity.order_id, status: 'PENDING' },
        { lastFailure: entity.error_description ?? entity.error_reason ?? 'Payment failed' }
      );
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`Webhook ${event.event} failed:`, razorpay.errorText(err));
    // A payment that isn't ours won't get better on retry.
    if (err.code === 'payment_mismatch' || err.code === 'payment_not_completed') {
      return res.status(200).json({ ok: false });
    }
    return res.status(500).json({ error: 'Webhook handling failed' });
  }
});

module.exports = router;
