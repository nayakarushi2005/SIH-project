import axios from 'axios';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';

import { getToken } from './session';

const API_PORT = 5000;

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

/** Per-field validation messages from a failed updateMe or createJob, or {}. */
export function getFieldErrors(err) {
  return err?.response?.data?.fields || {};
}

// ── Job API calls ────────────────────────────────────────────────────────────

/**
 * Uploads one picked image straight to Cloudinary using a signature from the
 * backend, and returns its secure URL for createJob.
 * photo: { uri } — an ImagePicker asset.
 */
export async function uploadJobPhoto({ uri }) {
  const { data: sig } = await api.post('/uploads/job-photo/sign');

  const form = new FormData();
  // Expo's fetch can't send React Native's { uri, name, type } file parts;
  // an expo-file-system File is a Blob it can read the bytes from.
  form.append('file', new File(uri));
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('folder', sig.folder);
  form.append('signature', sig.signature);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.secure_url) {
    throw new Error(body?.error?.message || 'Photo upload failed.');
  }
  return body.secure_url;
}

/**
 * Posts a job. Body: { category, description, photos: [url], price,
 * expectedDurationMins, location: { lat, lng }, address? }
 * On a 400 the backend sends { error, fields } — see getFieldErrors.
 */
export async function createJob(job) {
  const res = await api.post('/jobs', job);
  return res.data;
}

/** The current user's posted jobs, newest first. */
export async function listJobs() {
  const res = await api.get('/jobs');
  return res.data;
}

/**
 * Rates the worker who completed a job (once per job).
 * Body: { rating: 1-5, praised?: [traitId], criticized?: [traitId],
 *         rehire?: boolean, block?: boolean, comment? }
 * On a 400 the backend sends { error, fields } — see getFieldErrors.
 */
export async function submitFeedback(jobId, feedback) {
  const res = await api.post(`/jobs/${jobId}/feedback`, feedback);
  return res.data;
}

/** A job the current user posted or is assigned to as the worker. */
export async function getJob(jobId) {
  const res = await api.get(`/jobs/${jobId}`);
  return res.data;
}

// ── Worker API calls ─────────────────────────────────────────────────────────

/** The current user's worker profile, or null if they haven't registered. */
export async function getWorkerProfile() {
  try {
    const res = await api.get('/workers/me');
    return res.data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Registers as a worker or updates the worker profile.
 * Body: { skills: [serviceId], bio?, experienceYears?, serviceRadiusKm? }
 * 403 with code AADHAAR_REQUIRED → the user must verify first.
 */
export async function saveWorkerProfile(fields) {
  const res = await api.put('/workers/me', fields);
  return res.data;
}

/** True when the backend refused because the user isn't Aadhaar-verified. */
export function isAadhaarRequired(err) {
  return err?.response?.data?.code === 'AADHAAR_REQUIRED';
}

export async function goOnline(location) {
  const res = await api.post('/workers/me/online', { location });
  return res.data;
}

export async function goOffline() {
  const res = await api.post('/workers/me/offline');
  return res.data;
}

/** Location heartbeat while online. Returns false if the server says we're offline. */
export async function sendWorkerLocation(location) {
  try {
    await api.post('/workers/me/location', { location });
    return true;
  } catch (err) {
    if (err?.response?.status === 409) return false;
    throw err;
  }
}

/**
 * What clients' feedback says about this worker: { rating, completedJobs,
 * strengths, improve, skills } — see GET /api/workers/me/insights.
 */
export async function getWorkerInsights() {
  const res = await api.get('/workers/me/insights');
  return res.data;
}

/** Job offers waiting for this worker's answer. */
export async function getOffers() {
  const res = await api.get('/workers/me/offers');
  return res.data;
}

export async function acceptJob(jobId) {
  const res = await api.post(`/jobs/${jobId}/accept`);
  return res.data;
}

export async function rejectJob(jobId) {
  await api.post(`/jobs/${jobId}/reject`);
}

/** Starts an assigned job with the client's 4-digit code. */
export async function startJob(jobId, code) {
  const res = await api.post(`/jobs/${jobId}/start`, { code });
  return res.data;
}

export async function completeJob(jobId) {
  const res = await api.post(`/jobs/${jobId}/complete`);
  return res.data;
}

/** Backs out of an assigned job before starting; it goes to another worker. */
export async function withdrawJob(jobId) {
  await api.post(`/jobs/${jobId}/withdraw`);
}

export default api;
