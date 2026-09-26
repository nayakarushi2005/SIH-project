import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import { useUser } from '../context/UserContext';

/**
 * The signed-in user's profile, refreshed every time the screen gains focus.
 * State lives in UserProvider so all screens stay in sync.
 */
export default function useProfile() {
  const { user, setUser, error, refreshing, reload, refresh } = useUser();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { user, setUser, error, refreshing, refresh, reload };
}
