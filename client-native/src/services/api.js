import axios from 'axios';
import Constants from 'expo-constants';

import i18n from '../i18n';
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
export function getErrorMessage(err, fallback) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return i18n.t('errors.timeout');
  if (err?.message === 'Network Error') {
    return i18n.t('errors.network', { url: API_BASE_URL });
  }
  return err?.message || fallback || i18n.t('errors.generic');
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

// ── Categories ──────────────────────────────────────────────────────────────

/** Job categories grouped for display — { lang, groups: [{ slug, name, icon, categories }] } */
export async function getCategories(lang = 'en') {
  const res = await api.get('/categories', { params: { lang } });
  return res.data;
}

// ── Worker ──────────────────────────────────────────────────────────────────

/** { name?, incomeBracket, categories, onboardedVia? } → updated profile. 400 has fields. */
export async function registerWorker(body) {
  const res = await api.post('/worker/register', body);
  return res.data;
}

export async function deregisterWorker() {
  const res = await api.post('/worker/deregister');
  return res.data;
}

export async function dismissWorkerPrompt() {
  const res = await api.post('/worker/dismiss-prompt');
  return res.data;
}

// ── Federations ─────────────────────────────────────────────────────────────

/** { match, federations: [{ id, name, city, pincode, memberCount, match, myStatus }] } */
export async function getNearbyFederations() {
  const res = await api.get('/federations/nearby');
  return res.data;
}

/** Ask to join; returns the updated profile. */
export async function requestFederation(federationId) {
  const res = await api.post('/worker/federation', { federationId });
  return res.data;
}

/** Cancel a pending request or leave; returns the updated profile. */
export async function leaveFederation() {
  const res = await api.delete('/worker/federation');
  return res.data;
}

/** Per-field validation messages from a failed updateMe, or {}. */
export function getFieldErrors(err) {
  return err?.response?.data?.fields || {};
}

export default api;
