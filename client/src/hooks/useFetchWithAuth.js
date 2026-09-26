import { useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Default backend base URL.
 * In production you'd pull this from an env variable (VITE_API_URL).
 */
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/**
 * useFetchWithAuth
 *
 * A hook that returns an `authFetch` function — a thin wrapper around
 * the native `fetch` that:
 *
 *  1. Automatically attaches the current access token as a
 *     `Bearer` token in the Authorization header.
 *
 *  2. Handles the backend's transparent token‑refresh flow:
 *     If the backend returns **401** with a `newAccessToken` in the
 *     JSON body (generated via the refresh‑token cookie), the hook
 *     saves the new token in AuthContext and **retries the original
 *     request once** with the fresh token.
 *
 *  3. If the refresh also fails (403 — session expired), the user
 *     is automatically logged out on the client side.
 *
 * Usage:
 *   const authFetch = useFetchWithAuth();
 *   const res  = await authFetch('/api/some-endpoint');
 *   const data = await res.json();
 *
 * You can pass the same options as native `fetch`:
 *   await authFetch('/api/data', { method: 'POST', body: JSON.stringify(payload) });
 */
export default function useFetchWithAuth() {
  const { accessToken, login, user, userType, logout } = useAuth();

  // Keep a stable ref to the latest token so the retry always uses the
  // freshest value without needing to re‑create the callback.
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const authFetch = useCallback(
    /**
     * @param {string}      endpoint - Path relative to the API base (e.g. '/api/users')
     * @param {RequestInit} [options] - Standard fetch options
     * @returns {Promise<Response>}
     */
    async (endpoint, options = {}) => {
      const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

      // ── Build headers ───────────────────────────────────────────
      const headers = new Headers(options.headers);

      if (tokenRef.current) {
        headers.set('Authorization', `Bearer ${tokenRef.current}`);
      }

      // Default to JSON content‑type when a body is present and no
      // content‑type has been explicitly set.
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      // ── First request ───────────────────────────────────────────
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // send the HTTP‑only refresh‑token cookie
      });

      // ── Token‑refresh interception ──────────────────────────────
      // The backend's `ensureAuth` middleware returns 401 + newAccessToken
      // when the access token expired but the refresh cookie is still valid.
      if (response.status === 401) {
        try {
          const body = await response.json();

          if (body.newAccessToken) {
            // Persist the refreshed token in AuthContext
            tokenRef.current = body.newAccessToken;
            login({ accessToken: body.newAccessToken, user }, userType);

            // Retry the original request with the new token
            headers.set('Authorization', `Bearer ${body.newAccessToken}`);

            return fetch(url, {
              ...options,
              headers,
              credentials: 'include',
            });
          }
        } catch {
          // JSON parsing failed — fall through to return the original 401 response
        }

        // If we reach here the refresh didn't yield a new token either;
        // treat it as a full session expiry → log out.
        logout();
      }

      // ── 403 — refresh token also gone ───────────────────────────
      if (response.status === 403) {
        logout();
      }

      return response;
    },
    // `login` and `logout` are stable (useCallback in AuthContext), so
    // this only re‑creates when user / userType actually change.
    [login, logout, user, userType],
  );

  return authFetch;
}
