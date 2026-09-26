import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { applyServerLanguage, languageEpoch } from '../i18n/language';
import { getErrorMessage, getMe, isUnauthorized } from '../services/api';
import { clearSession, getUser, saveUser } from '../services/session';

const UserContext = createContext(null);

/**
 * The signed-in user's profile, shared by every screen so a change made on
 * one (e.g. registering as a worker) shows up everywhere — including the
 * tab bar. Shows the cached copy first, then refreshes from the server.
 */
export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const setUser = useCallback((next) => {
    setUserState(next);
    if (next) saveUser(next).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    try {
      const cached = await getUser();
      if (cached) setUserState((current) => current ?? cached);

      const epoch = languageEpoch();
      const fresh = await getMe();
      setUser(fresh);
      setError(null);
      // Follow a language changed on another device (but never undo a pick
      // made here while this request was in flight).
      await applyServerLanguage(fresh.preferredLanguage, epoch);
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const value = useMemo(
    () => ({ user, setUser, error, refreshing, reload, refresh }),
    [user, setUser, error, refreshing, reload, refresh]
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
