/**
 * Everything that talks to Razorpay (and its IFSC directory) lives here, so
 * the rest of the code — and the tests — never touch the SDK directly.
 *
 * Env:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET — API keys (rzp_test_… in test mode)
 *   RAZORPAY_WEBHOOK_SECRET              — the secret set on the dashboard webhook
 */

const crypto = require('crypto');
const axios = require('axios');
const Razorpay = require('razorpay');

let client = null;

/** Whether online payments are set up on this server. */
function isConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function rzp() {
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

function keyId() {
  return process.env.RAZORPAY_KEY_ID;
}

/** Constant-time compare of two hex HMACs. */
function hmacMatches(payload, secret, signature) {
  if (typeof signature !== 'string' || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Checkout's success callback: HMAC(order_id|payment_id) with the key secret. */
function verifyPaymentSignature(orderId, paymentId, signature) {
  return hmacMatches(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET, signature);
}

/** A webhook: HMAC of the raw request body with the webhook secret. */
function verifyWebhookSignature(rawBody, signature) {
  return hmacMatches(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET, signature);
}

function createOrder({ amountPaise, receipt, notes }) {
  return rzp().orders.create({ amount: amountPaise, currency: 'INR', receipt, notes });
}

function fetchPayment(paymentId) {
  return rzp().payments.fetch(paymentId);
}

function capturePayment(paymentId, amountPaise) {
  return rzp().payments.capture(paymentId, amountPaise, 'INR');
}

/** Moves `amountPaise` of a captured payment into a Route linked account. */
async function transferToLinkedAccount(paymentId, accountId, amountPaise, notes) {
  const res = await rzp().payments.transfer(paymentId, {
    transfers: [{ account: accountId, amount: amountPaise, currency: 'INR', notes }],
  });
  return res.items?.[0] ?? res;
}

/**
 * Creates a Route linked account for a worker and attaches their bank account
 * for settlements. Returns the acc_… id. The bank details go to Razorpay only.
 *
 * Profile category/subcategory must be values Razorpay accepts for your
 * account — override with RAZORPAY_ROUTE_CATEGORY / _SUBCATEGORY if needed.
 */
async function createLinkedAccount({ referenceId, email, phone, name, address, bank }) {
  const account = await rzp().accounts.create({
    email,
    phone,
    type: 'route',
    reference_id: referenceId,
    legal_business_name: name,
    business_type: 'individual',
    contact_name: name,
    profile: {
      category: process.env.RAZORPAY_ROUTE_CATEGORY || 'services',
      subcategory: process.env.RAZORPAY_ROUTE_SUBCATEGORY || 'repair_and_cleaning',
      addresses: { registered: { ...address, country: 'IN' } },
    },
  });
  await rzp().stakeholders.create(account.id, { name, email });
  const product = await rzp().products.requestProductConfiguration(account.id, {
    product_name: 'route',
    tnc_accepted: true,
  });
  await rzp().products.edit(account.id, product.id, {
    settlements: {
      account_number: bank.accountNumber,
      ifsc_code: bank.ifsc,
      beneficiary_name: bank.holderName,
    },
    tnc_accepted: true,
  });
  return account.id;
}

/**
 * Bank and branch for an IFSC from Razorpay's free directory:
 * { bank, branch, city, state }, null if the code doesn't exist, or
 * undefined if the directory couldn't be reached.
 */
async function lookupIfsc(ifsc) {
  try {
    const { data } = await axios.get(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`, {
      timeout: 5000,
    });
    return { bank: data.BANK, branch: data.BRANCH, city: data.CITY, state: data.STATE };
  } catch (err) {
    if (err.response?.status === 404) return null;
    return undefined;
  }
}

/** Razorpay's error text, for logs and stored failure reasons. */
function errorText(err) {
  return err?.error?.description || err?.message || 'Unknown Razorpay error';
}

module.exports = {
  capturePayment,
  createLinkedAccount,
  createOrder,
  errorText,
  fetchPayment,
  isConfigured,
  keyId,
  lookupIfsc,
  transferToLinkedAccount,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
