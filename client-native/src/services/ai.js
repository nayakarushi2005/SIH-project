import axios from 'axios';
import Constants from 'expo-constants';

import { getToken } from './session';

const AI_PORT = 8000;

// Same idea as services/api.js: EXPO_PUBLIC_AI_BASE_URL wins; in development
// the phone reaches the AI service on the laptop that runs Metro.
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_AI_BASE_URL) return process.env.EXPO_PUBLIC_AI_BASE_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:${AI_PORT}`;
  return `http://localhost:${AI_PORT}`;
}

export const AI_BASE_URL = resolveBaseUrl();

const ai = axios.create({
  baseURL: AI_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

ai.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Voice onboarding. Every call returns
 * { speak, ui, step, done, handoff, filled, lang } (+ sessionId on start).
 */
export async function startOnboarding() {
  const res = await ai.post('/v1/onboarding/sessions');
  return res.data;
}

/** payload: { transcript } or { selection } */
export async function sendTurn(sessionId, payload) {
  const res = await ai.post(`/v1/onboarding/sessions/${sessionId}/turns`, payload);
  return res.data;
}

export async function getOnboarding(sessionId) {
  const res = await ai.get(`/v1/onboarding/sessions/${sessionId}`);
  return res.data;
}
