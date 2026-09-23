import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Auth API calls ───────────────────────────────────────────────────────────

/**
 * Exchange Google ID token for app JWT.
 * Returns { token, isNewUser, needsAadhaarVerification, user }
 */
export async function googleSignIn(idToken) {
  const res = await api.post('/auth/google', { idToken });
  return res.data;
}

/**
 * Initiate Aadhaar OTP — returns { transactionId, message }
 */
export async function initiateAadhaarOTP(aadhaarNumber) {
  const res = await api.post('/auth/aadhaar/initiate', { aadhaarNumber });
  return res.data;
}

/**
 * Verify Aadhaar OTP — updates user doc and returns updated user
 */
export async function verifyAadhaarOTP(transactionId, otp, aadhaarLastFour) {
  const res = await api.post('/auth/aadhaar/verify', {
    transactionId,
    otp,
    aadhaarLastFour,
  });
  return res.data;
}

/**
 * Get current user profile
 */
export async function getMe() {
  const res = await api.get('/auth/me');
  return res.data;
}

export default api;
