import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { applyServerLanguage, languageEpoch } from '../i18n/language';
import { getErrorMessage, getMe, isUnauthorized } from '../services/api';
import { clearSession, getUser, saveUser } from '../services/session';

const UserContext = createContext(null);

// Per-app-session choices (reset on sign-out so the next account starts clean).
export const sessionFlags = { workerPromptClosed: false, locationAsked: false };

/**
 * The signed-in user's profile, shared by every screen so a change made on
 * one (e.g. registering as a worker) shows up everywhere — including the
 * tab bar. Shows the cached copy first, then refreshes from the server.
 */
export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // True once /me has answered this session — prompts wait for it so they
  // never act on a stale cached profile.
  const [fresh, setFresh] = useState(false);

  const setUser = useCallback((next) => {
    setUserState(next);
    if (next) saveUser(next).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    try {
      const cached = await getUser();
      // Keep what's on screen if it's the same account; a different cached
      // account (just signed in) replaces it.
      if (cached) setUserState((current) => (current?.id === cached.id ? current : cached));

      const epoch = languageEpoch();
      const latest = await getMe();
      setUser(latest);
      setFresh(true);
      setError(null);
      // Follow a language changed on another device (but never undo a pick
      // made here while this request was in flight).
      await applyServerLanguage(latest.preferredLanguage, epoch);
    } catch (err) {
      if (isUnauthorized(err)) {
        await clearSession();
        setUserState(null);
        router.replace('/auth');
        return;
      }
      setError(getErrorMessage(err));
    }
  }, [setUser]);

  /** Forget the signed-in account (sign-out, or before a new sign-in). */
  const clear = useCallback(() => {
    setUserState(null);
    setError(null);
    setFresh(false);
    sessionFlags.workerPromptClosed = false;
    sessionFlags.locationAsked = false;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const value = useMemo(
    () => ({ user, setUser, fresh, error, refreshing, reload, refresh, clear }),
    [user, setUser, fresh, error, refreshing, reload, refresh, clear]
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
