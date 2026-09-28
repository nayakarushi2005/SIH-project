# Payments, receipts and worker payouts

Clients pay for a job **after it is COMPLETED** — so cancellations, expiries
and worker withdrawals never involve money or refunds. Payment state lives in
its own `payments` collection; `Job` is not touched, and neither is Aadhaar
verification (a payout account is a separate workflow).

## Flow

```
Client, job COMPLETED
  POST /api/payments/jobs/:jobId/order    → Razorpay order (amount from job.price, in paise)
  app opens Razorpay Checkout (react-native-razorpay)
  POST /api/payments/jobs/:jobId/verify   → HMAC signature check, fetch + capture, PAID
Razorpay → POST /api/webhooks/razorpay    → same confirmation (source of truth; idempotent)

Worker, cash instead
  POST /api/payments/jobs/:jobId/cash     → PAID (cash), nothing to pay out

Once PAID
  receipt number RCPT-<year>-<seq> (atomic counter)
  GET /api/payments/:id/receipt-link      → 15-minute link to the PDF
  worker share paid out (services/payment.js settlePayout)
```

Worker screens: **Earnings** (`GET /api/payments/earnings`) and **Bank details**
(`GET|PUT /api/payments/payout-account`). Only the last 4 digits of the account
number are stored. Changing bank details holds payouts for
`PAYOUT_CHANGE_HOLD_HOURS` (default 24) in case the account was taken over.

## Payout modes (`PAYOUT_MODE`)

- `simulated` (default) — records the payout as settled without moving money.
  Right for the prototype: Route linked accounts need KYC activation before
  transfers settle.
- `route` — creates a Razorpay Route linked account from the bank details and
  transfers the worker share of each captured payment to it. Needs Route
  enabled on the Razorpay account, and the worker's phone and PIN code on
  their profile. Check `RAZORPAY_ROUTE_CATEGORY` / `_SUBCATEGORY` against the
  categories Razorpay accepts for your account.

Only `services/razorpay.js` talks to Razorpay, so switching to another payout
provider (Cashfree Payouts, RazorpayX) means changing that file.

## Setup (test mode — free, no KYC)

1. Sign up at dashboard.razorpay.com, switch to **Test Mode**, generate API keys.
2. In `backend/.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (see `.env.example`).
3. Webhook: Dashboard → Webhooks → add `https://<public-host>/api/webhooks/razorpay`
   with events `payment.authorized`, `payment.captured`, `payment.failed`,
   `order.paid`; put its secret in `RAZORPAY_WEBHOOK_SECRET`. Locally, expose
   the API with `ngrok http 3000` or `cloudflared tunnel`. Without a webhook,
   payments still confirm through `/verify`.
4. App: `react-native-razorpay` is a native module — rebuild the dev client
   (`npm run android`). It does not work in Expo Go.
5. Test payments: UPI `success@razorpay` / `failure@razorpay`, or the test cards
   in Razorpay's docs.

Without Razorpay keys the app still works: online payment answers
`payments_not_configured`, and cash payments, receipts and earnings work as usual.
