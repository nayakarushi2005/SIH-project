import { Stack } from 'expo-router';

import OfferModal from '../components/OfferModal';
import { WorkerModeProvider } from '../context/WorkerMode';

export default function RootLayout() {
  return (
    <WorkerModeProvider>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Job requests pop up over whatever screen a worker is on. */}
      <OfferModal />
    </WorkerModeProvider>
  );
}
