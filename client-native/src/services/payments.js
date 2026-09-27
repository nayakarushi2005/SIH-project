import api from './api';

// ── Paying for a completed job ───────────────────────────────────────────────

/**
 * The payment for a completed job, as the client or the assigned worker
 * sees it: { id, status: 'PENDING' | 'PAID', method, amount, receiptNumber, … }.
 * The worker also gets { platformFee, workerAmount, payout }.
 */
export async function getJobPayment(jobId) {
  const res = await api.get(`/payments/jobs/${jobId}`);
  return res.data;
}

/** Client: opens the Razorpay order — { keyId, orderId, amount (paise), currency, prefill }. */
export async function createPaymentOrder(jobId) {
  const res = await api.post(`/payments/jobs/${jobId}/order`);
  return res.data;
}

/** Client: hands Checkout's success response to the backend to confirm. Returns the payment. */
export async function verifyPayment(jobId, { orderId, paymentId, signature }) {
  const res = await api.post(`/payments/jobs/${jobId}/verify`, { orderId, paymentId, signature });
  return res.data;
}

/** Worker: "I received the payment in cash." Returns the payment. */
export async function confirmCashPayment(jobId) {
  const res = await api.post(`/payments/jobs/${jobId}/cash`);
  return res.data;
}

/** A short-lived URL of the receipt PDF, to open in the browser. */
export async function getReceiptLink(paymentId) {
  const res = await api.get(`/payments/${paymentId}/receipt-link`);
  return res.data.url;
}

// ── Worker earnings and payout account ───────────────────────────────────────

/** { totals: { received, onTheWay, awaitingClient }, payoutAccount, payments } */
export async function getEarnings() {
  const res = await api.get('/payments/earnings');
  return res.data;
}

/** The worker's bank details for payouts (last 4 digits only), or null. */
export async function getPayoutAccount() {
  const res = await api.get('/payments/payout-account');
  return res.data.account;
}

/**
 * Saves bank details: { holderName, accountNumber, confirmAccountNumber, ifsc }.
 * On a 400 the backend sends { error, fields } — see getFieldErrors.
 */
export async function savePayoutAccount(details) {
  const res = await api.put('/payments/payout-account', details);
  return res.data.account;
}
