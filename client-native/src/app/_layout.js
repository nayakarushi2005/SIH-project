import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';

import OfferModal from '../components/OfferModal';
import { UserProvider } from '../context/UserContext';
import { WorkerModeProvider } from '../context/WorkerMode';
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
      <WorkerModeProvider>
        <Stack screenOptions={{ headerShown: false }} />
        {/* Job requests pop up over whatever screen a worker is on. */}
        <OfferModal />
      </WorkerModeProvider>
    </UserProvider>
  );
}
