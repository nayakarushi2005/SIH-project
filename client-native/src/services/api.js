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
 * Initiate Digilocker URL — returns { url, clientToken, state }
 */
export async function initiateDigilocker() {
  const res = await api.post('/auth/aadhaar/initiate');
  return res.data;
}

/**
 * Verify Digilocker Data — updates user doc and returns updated user
 */
export async function verifyDigilocker(clientToken, state) {
  const res = await api.post('/auth/aadhaar/verify', {
    clientToken,
    state,
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
