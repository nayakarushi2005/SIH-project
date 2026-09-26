import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { getErrorMessage, getMe, isUnauthorized } from '../services/api';
import { clearSession, getUser, saveUser } from '../services/session';

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

  return { user, error, refreshing, refresh, reload: load };
}
