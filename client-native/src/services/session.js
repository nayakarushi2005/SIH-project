import * as SecureStore from 'expo-secure-store';

const KEYS = {
  token: 'authToken',
  user: 'user',
  pendingDigilocker: 'pendingDigilocker',
  recentJobs: 'recentJobs',
  workerMode: 'workerMode',
  theme: 'theme',
};

const RECENT_JOBS_LIMIT = 4;

async function readJSON(key) {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}

export function getToken() {
  return SecureStore.getItemAsync(KEYS.token);
}

export function getUser() {
  return readJSON(KEYS.user);
}

export function saveUser(user) {
  return SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
}

export async function saveSession(token, user) {
  await SecureStore.setItemAsync(KEYS.token, token);
  await saveUser(user);
}

export async function clearSession() {
  await Promise.all(
    Object.values(KEYS)
      .filter((key) => key !== KEYS.theme)
      .map((key) => SecureStore.deleteItemAsync(key))
  );
}

export function savePendingDigilocker({ clientToken, state }) {
  return SecureStore.setItemAsync(
    KEYS.pendingDigilocker,
    JSON.stringify({ clientToken, state })
  );
}

export function getPendingDigilocker() {
  return readJSON(KEYS.pendingDigilocker);
}

export function clearPendingDigilocker() {
  return SecureStore.deleteItemAsync(KEYS.pendingDigilocker);
}

export async function getRecentJobs() {
  const jobs = await readJSON(KEYS.recentJobs);
  return Array.isArray(jobs) ? jobs : [];
}

export async function addRecentJob(job) {
  const entry = { ...job, updatedAt: Date.now() };
  const others = (await getRecentJobs()).filter((j) => j.id !== job.id);
  const jobs = [entry, ...others].slice(0, RECENT_JOBS_LIMIT);
  await SecureStore.setItemAsync(KEYS.recentJobs, JSON.stringify(jobs));
  return jobs;
}

export async function getWorkerMode() {
  return (await SecureStore.getItemAsync(KEYS.workerMode)) === 'on';
}

export function setWorkerMode(enabled) {
  return SecureStore.setItemAsync(KEYS.workerMode, enabled ? 'on' : 'off');
}

export async function getThemePreference() {
  return (await SecureStore.getItemAsync(KEYS.theme)) ?? 'light';
}

export function setThemePreference(value) {
  return SecureStore.setItemAsync(KEYS.theme, value);
}
