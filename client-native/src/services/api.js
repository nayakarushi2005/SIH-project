import axios from 'axios';
import Constants from 'expo-constants';

import { getToken } from './session';

const API_PORT = 3000;

// EXPO_PUBLIC_API_BASE_URL wins when set (staging/production). In development
// we otherwise reuse the IP the phone already reaches Metro on, so the API URL
// follows your laptop when its LAN IP changes instead of silently timing out.
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) {
    return `http://${host}:${API_PORT}/api`;
  }
  return `http://localhost:${API_PORT}/api`;
}

export const API_BASE_URL = resolveBaseUrl();

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Turns an axios/network error into a message fit for an Alert.
 * The backend responds with { error: '...' } on failure.
 */
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (err?.message === 'Network Error') {
    return `Can't reach the server at ${API_BASE_URL}. Is the backend running and on the same network?`;
  }
  return err?.message || fallback;
}

export function isUnauthorized(err) {
  return err?.response?.status === 401;
}

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

/**
 * Update the current user's profile with any subset of editable fields.
 * On a 400 the backend sends { error, fields } — see getFieldErrors.
 */
export async function updateMe(fields) {
  const res = await api.patch('/auth/me', fields);
  return res.data;
}

/** Per-field validation messages from a failed updateMe, or {}. */
export function getFieldErrors(err) {
  return err?.response?.data?.fields || {};
}

export default api;
