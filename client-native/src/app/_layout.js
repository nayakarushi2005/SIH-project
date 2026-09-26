import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';

import { UserProvider } from '../context/UserContext';
import '../i18n';
import { initLanguage } from '../i18n/language';

export default function RootLayout() {
  // Hold the first frame until the saved language is applied, so the app
  // never flashes English for a Hindi user.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initLanguage().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return (
    <UserProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </UserProvider>
  );
}
