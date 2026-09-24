const axios = require('axios');

const MEON_BASE_URL = 'https://digilocker.meon.co.in';
const MEON_COMPANY_NAME = process.env.MEON_COMPANY_NAME;
const MEON_SECRET_TOKEN = process.env.MEON_SECRET_TOKEN;

/**
 * Step 1 — Generate Client Token and Digilocker Link
 * @returns {Promise<{ url: string, clientToken: string, state: string }>}
 */
async function initiateDigilocker() {
  try {
    // 1. Get Access Token (Client Token & State)
    const tokenRes = await axios.post(`${MEON_BASE_URL}/get_access_token`, {
      company_name: MEON_COMPANY_NAME,
      secret_token: MEON_SECRET_TOKEN,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { client_token, state } = tokenRes.data;
    if (!client_token) throw new Error('Failed to get client_token from Meon');

    // 2. Generate Digilocker URL
    const urlRes = await axios.post(`${MEON_BASE_URL}/digi_url`, {
      client_token,
      redirect_url: 'sihconnect://aadhaar-callback', // Expo Deep Link schema (app.json scheme)
      company_name: MEON_COMPANY_NAME,
      documents: 'aadhaar',
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const urlData = urlRes.data;
    if (!urlData.success) throw new Error(urlData.msg || 'Failed to generate Digilocker URL');

    return {
      success: true,
      url: urlData.url,
      clientToken: client_token,
      state: state,
    };
  } catch (error) {
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message || 'Failed to initiate Digilocker';
    throw new Error(msg);
  }
}

/**
 * Step 2 — Fetch Aadhaar Data after user authorizes Digilocker
 * @param {string} clientToken 
 * @param {string} state 
 */
async function verifyDigilocker(clientToken, state) {
  try {
    const res = await axios.post(`${MEON_BASE_URL}/v2/send_entire_data`, {
      client_token: clientToken,
      state: state,
      status: true,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const data = res.data.data;
    if (!res.data.success || !data) {
      throw new Error(res.data.msg || 'Failed to retrieve Aadhaar data');
    }

    return {
      success: true,
      name: data.name,
      dob: data.dob,
      gender: data.gender === 'M' || data.gender === 'Male' ? 'Male' : (data.gender === 'F' || data.gender === 'Female' ? 'Female' : data.gender),
      address: [data.house, data.locality, data.dist, data.state, data.pincode].filter(Boolean).join(', '),
      maskedAadhaar: data.aadhar_no, // e.g. xxxxxxxx7845
    };
  } catch (error) {
    const msg = error.response?.data?.msg || error.response?.data?.message || error.message || 'Failed to verify Digilocker data';
    throw new Error(msg);
  }
}

module.exports = { initiateDigilocker, verifyDigilocker };
