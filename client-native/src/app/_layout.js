import { useEffect, useState } from 'react';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';

import OfferModal from '../components/OfferModal';
import { UserProvider } from '../context/UserContext';
import { WorkerModeProvider } from '../context/WorkerMode';
import '../i18n';
import { initLanguage } from '../i18n/language';
// Defines the safety shield's background task — must load before any screen.
import { handleShieldNotification } from '../services/shield';

/**
 * Acts on taps on the safety shield notification, including the one that
 * launched the app from a killed state.
 */
function ShieldNotificationResponder() {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!response) return;
    Notifications.clearLastNotificationResponse();
    handleShieldNotification(response).then((open) => {
      if (open) router.navigate('/sisterhood');
    });
  }, [response]);

  return null;
}

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
        <ShieldNotificationResponder />
      </WorkerModeProvider>
    </UserProvider>
  );
}
