/**
 * A worker's payout account: checking the bank details they enter, and
 * registering them (a Razorpay Route linked account in 'route' mode).
 * Separate from identity verification — this only decides where money goes.
 */

const PayoutAccount = require('../models/PayoutAccount');
const { fieldError } = require('./errors');
const { payoutMode, settlePendingPayouts } = require('./payment');
const razorpay = require('./razorpay');

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const NAME_RE = /^[\p{L} .'-]{2,100}$/u;

function changeHoldMs() {
  const hours = Number(process.env.PAYOUT_CHANGE_HOLD_HOURS);
  return (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 60 * 60 * 1000;
}

/**
 * Checks the form body. Returns { bank, errors } where bank is
 * { holderName, accountNumber, ifsc, bankName, branch, state, city }.
 */
async function validatePayoutAccount(body = {}) {
  const errors = {};

  const holderName = typeof body.holderName === 'string' ? body.holderName.trim().replace(/\s+/g, ' ') : '';
  if (!NAME_RE.test(holderName)) {
    errors.holderName = fieldError('payout_holder_name_invalid', 'Enter the name exactly as it is on your bank account.');
  }

  const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.replace(/\s/g, '') : '';
  if (!ACCOUNT_RE.test(accountNumber)) {
    errors.accountNumber = fieldError('payout_account_number_invalid', 'Enter a valid account number (9–18 digits).');
  } else if (String(body.confirmAccountNumber ?? '').replace(/\s/g, '') !== accountNumber) {
    errors.confirmAccountNumber = fieldError('payout_account_number_mismatch', 'The account numbers don’t match.');
  }

  const ifsc = typeof body.ifsc === 'string' ? body.ifsc.trim().toUpperCase() : '';
  let branchInfo;
  if (!IFSC_RE.test(ifsc)) {
    errors.ifsc = fieldError('payout_ifsc_invalid', 'Enter a valid 11-character IFSC code.');
  } else {
    branchInfo = await razorpay.lookupIfsc(ifsc);
    if (branchInfo === null) {
      errors.ifsc = fieldError('payout_ifsc_not_found', 'We couldn’t find a bank branch with this IFSC code.');
    }
  }

  return {
    errors,
    bank: {
      holderName,
      accountNumber,
      ifsc,
      bankName: branchInfo?.bank ?? null,
      branch: branchInfo?.branch ?? null,
      city: branchInfo?.city ?? null,
      state: branchInfo?.state ?? null,
    },
  };
}

/**
 * Saves `user`'s payout account from checked `bank` details, creating the
 * Razorpay linked account first in 'route' mode. Throws { code, message }
 * for the user when that can't be done.
 */
async function savePayoutAccount(user, bank) {
  const mode = payoutMode();
  let razorpayAccountId = null;

  if (mode === 'route') {
    if (!razorpay.isConfigured()) {
      throw { status: 503, code: 'payments_not_configured', message: 'Online payments aren’t set up yet.' };
    }
    if (!/^\d{10}$/.test(user.phone ?? '') || !/^\d{6}$/.test(user.pincode ?? '')) {
      throw {
        status: 400,
        code: 'payout_profile_incomplete',
        message: 'Add your phone number and PIN code to your profile first.',
      };
    }
    try {
      razorpayAccountId = await razorpay.createLinkedAccount({
        referenceId: String(user._id).slice(-20),
        email: user.googleEmail,
        phone: user.phone,
        name: bank.holderName,
        address: {
          street1: (user.address || user.city || bank.city || 'NA').slice(0, 100),
          street2: (user.city || bank.city || 'NA').slice(0, 100),
          city: user.city || bank.city || 'NA',
          state: bank.state || 'NA',
          postal_code: user.pincode,
        },
        bank,
      });
    } catch (err) {
      console.error('Linked account creation failed:', razorpay.errorText(err));
      throw {
        status: 502,
        code: 'payout_account_failed',
        message: 'We couldn’t register this bank account. Please check the details and try again.',
      };
    }
  }

  const existing = await PayoutAccount.findOne({ worker: user._id });
  const account = await PayoutAccount.findOneAndUpdate(
    { worker: user._id },
    {
      worker: user._id,
      holderName: bank.holderName,
      ifsc: bank.ifsc,
      bankName: bank.bankName,
      branch: bank.branch,
      accountLast4: bank.accountNumber.slice(-4),
      status: 'ACTIVE',
      mode,
      razorpayAccountId,
      failureReason: null,
      // First account: pay out right away. A change: hold payouts for a while.
      holdPayoutsUntil: existing ? new Date(Date.now() + changeHoldMs()) : null,
    },
    { new: true, upsert: true }
  );

  // Earnings waiting for an account can go out now.
  settlePendingPayouts(user._id).catch((err) =>
    console.error(`Settling payouts for ${user._id} failed:`, err.message)
  );
  return account;
}

/** What the app sees of a payout account — never the full account number. */
function toPayoutAccount(account) {
  if (!account) return null;
  const onHold = account.holdPayoutsUntil && account.holdPayoutsUntil > new Date();
  return {
    holderName: account.holderName,
    bankName: account.bankName,
    branch: account.branch,
    ifsc: account.ifsc,
    accountLast4: account.accountLast4,
    status: account.status,
    holdPayoutsUntil: onHold ? account.holdPayoutsUntil : null,
    updatedAt: account.updatedAt,
  };
}

// Details that pass validation in test mode (HDFC0000001 is a real branch,
// so the IFSC lookup succeeds). The worker's name is filled in by the app.
const TEST_BANK = { accountNumber: '1234567890', ifsc: 'HDFC0000001' };

/**
 * How payouts work on this server, for the bank-details screen:
 * { mode: 'simulated' | 'route', testMode, testBank }. testBank is offered
 * only in test mode, so nobody fills in fake details against live keys.
 */
function payoutInfo() {
  const testMode = razorpay.isTestMode();
  return { mode: payoutMode(), testMode, testBank: testMode ? TEST_BANK : null };
}

module.exports = { payoutInfo, savePayoutAccount, toPayoutAccount, validatePayoutAccount };
