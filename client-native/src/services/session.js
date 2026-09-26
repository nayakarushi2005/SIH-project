import * as SecureStore from 'expo-secure-store';

// All SecureStore keys live here so screens never disagree on names.
const KEYS = {
  token: 'authToken',
  user: 'user',
  pendingDigilocker: 'pendingDigilocker',
};

async function readJSON(key) {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt entry — drop it rather than crash every screen that reads it.
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
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key))
  );
}

// The DigiLocker flow leaves the app for the browser, and Android may kill
// the app while it's in the background. Persisting the handshake lets the
// callback screen finish verification even after a cold start.
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
