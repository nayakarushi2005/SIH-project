import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { applyLanguage } from '../i18n/language';
import { getErrorMessage, getMe, isUnauthorized } from '../services/api';
import { clearSession, getUser, saveUser } from '../services/session';

/**
 * The signed-in user's profile: shows the cached copy instantly, then
 * refreshes from the server every time the screen gains focus. An expired
 * session sends the user back to sign-in.
 */
export default function useProfile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const cached = await getUser();
      if (cached) setUser((current) => current ?? cached);

      const fresh = await getMe();
      setUser(fresh);
      setError(null);
      await saveUser(fresh);
      // Follow a language changed on another device.
      if (fresh.preferredLanguage) await applyLanguage(fresh.preferredLanguage);
    } catch (err) {
      if (isUnauthorized(err)) {
        await clearSession();
        router.replace('/auth');
        return;
      }
      setError(getErrorMessage(err));
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { user, setUser, error, refreshing, refresh, reload: load };
}
