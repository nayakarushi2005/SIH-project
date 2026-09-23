const axios = require('axios');

const MEON_BASE_URL = process.env.MEON_BASE_URL || 'https://api.meon.co.in';
const MEON_SECRET_TOKEN = process.env.MEON_SECRET_TOKEN;
const MEON_COMPANY_CODE = process.env.MEON_COMPANY_CODE;

const meonClient = axios.create({
  baseURL: MEON_BASE_URL,
  headers: {
    Authorization: `Bearer ${MEON_SECRET_TOKEN}`,
    secret_token: MEON_SECRET_TOKEN,
    companycode: MEON_COMPANY_CODE,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Step 1 — Send OTP to Aadhaar-linked mobile number
 * @param {string} aadhaarNumber - 12-digit Aadhaar number
 * @returns {Promise<{ transactionId: string, message: string }>}
 */
async function initiateAadhaarOTP(aadhaarNumber) {
  try {
    const response = await meonClient.post('/v1/aadhaar-ekyc/initiate', {
      aadhaar: aadhaarNumber,
    });

    return {
      success: true,
      transactionId: response.data.transaction_id || response.data.transactionId,
      message: response.data.message || 'OTP sent successfully',
    };
  } catch (error) {
    const msg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Failed to initiate Aadhaar OTP';
    throw new Error(msg);
  }
}

/**
 * Step 2 — Verify OTP and get Aadhaar demographic data
 * @param {string} transactionId - from initiateAadhaarOTP response
 * @param {string} otp - 6-digit OTP entered by user
 * @returns {Promise<{ name, dob, gender, address, maskedAadhaar }>}
 */
async function verifyAadhaarOTP(transactionId, otp) {
  try {
    const response = await meonClient.post('/v1/aadhaar-ekyc/verify', {
      transaction_id: transactionId,
      otp,
    });

    const data = response.data;

    return {
      success: true,
      // Meon API returns these demographic fields
      name: data.name || data.full_name || null,
      dob: data.dob || data.date_of_birth || null,
      gender: data.gender || null,
      address: data.address || [
        data.house, data.street, data.landmark, data.locality,
        data.district, data.state, data.pincode,
      ]
        .filter(Boolean)
        .join(', ') || null,
      maskedAadhaar: data.masked_aadhaar || data.maskedAadhaar || null,
    };
  } catch (error) {
    const msg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'OTP verification failed';
    throw new Error(msg);
  }
}

module.exports = { initiateAadhaarOTP, verifyAadhaarOTP };
