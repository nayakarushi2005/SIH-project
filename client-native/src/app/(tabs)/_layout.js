import { useCallback, useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import LocationSheet from '../../components/LocationSheet';
import WorkerPrompt from '../../components/WorkerPrompt';
import { colors } from '../../constants/theme';
import { sessionFlags, useUser } from '../../context/UserContext';
import { dismissWorkerPrompt } from '../../services/api';
import { locationPermissionStatus } from '../../services/location';

function tabIcon(name) {
  // Filled icon when active, outline otherwise.
  function TabIcon({ color, focused, size }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, setUser, fresh, reload } = useUser();
  const [promptClosed, setPromptClosed] = useState(sessionFlags.workerPromptClosed);
  const [dismissing, setDismissing] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  // Modals can't swap instantly on iOS: wait for the sheet to finish closing.
  const [locationClosing, setLocationClosing] = useState(false);
  const [locationChecked, setLocationChecked] = useState(sessionFlags.locationAsked);

  useEffect(() => {
    reload();
  }, [reload]);

  // First time only: offer to detect the location of a user who has none.
  // If they already said no to the permission, don't nag — they can set it
  // from the Home header.
  const needsLocation = fresh && !!user && !user.location;
  useEffect(() => {
    if (!needsLocation || sessionFlags.locationAsked) return undefined;
    let active = true;
    locationPermissionStatus()
      .then((status) => {
        if (!active) return;
        if (status === 'undetermined') {
          sessionFlags.locationAsked = true;
          setLocationOpen(true);
        }
        setLocationChecked(true);
      })
      .catch(() => active && setLocationChecked(true));
    return () => {
      active = false;
    };
  }, [needsLocation]);

  const closeLocation = useCallback(() => {
    setLocationOpen(false);
    setLocationClosing(true);
    setTimeout(() => setLocationClosing(false), 450);
  }, []);

  // The worker question waits for a fresh profile and for the location
  // step to be settled and off screen.
  const locationSettled = (!needsLocation || locationChecked) && !locationOpen && !locationClosing;
  const showPrompt =
    fresh &&
    !!user &&
    !user.isWorker &&
    !user.workerPromptDismissed &&
    !promptClosed &&
    locationSettled;

  const closePrompt = useCallback(() => {
    sessionFlags.workerPromptClosed = true;
    setPromptClosed(true);
  }, []);

  const register = useCallback(() => {
    closePrompt();
    router.push('/worker-onboarding');
  }, [closePrompt, router]);

  const notWorker = useCallback(async () => {
    setDismissing(true);
    try {
      setUser(await dismissWorkerPrompt());
    } catch {
      closePrompt(); // ask again next launch
    } finally {
      setDismissing(false);
    }
  }, [closePrompt, setUser]);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
        {/* Everyone can book — workers too; their own jobs live in Worker mode. */}
        <Tabs.Screen
          name="bookings"
          options={{ title: t('tabs.bookings'), tabBarIcon: tabIcon('calendar') }}
        />
        <Tabs.Screen
          name="messages"
          options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubble-ellipses') }}
        />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
      </Tabs>

      <LocationSheet autoDetect visible={locationOpen} onClose={closeLocation} />

      <WorkerPrompt
        visible={showPrompt}
        busy={dismissing}
        onRegister={register}
        onNotWorker={notWorker}
        onClose={closePrompt}
      />
    </>
  );
}
