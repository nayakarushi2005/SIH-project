import { useCallback, useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import WorkerPrompt from '../../components/WorkerPrompt';
import { colors } from '../../constants/theme';
import { useUser } from '../../context/UserContext';
import { dismissWorkerPrompt } from '../../services/api';

// Choices that last until the app is closed.
const sessionFlags = { workerPromptClosed: false };

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
  const { user, setUser, reload } = useUser();
  const [promptClosed, setPromptClosed] = useState(sessionFlags.workerPromptClosed);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    reload();
  }, [reload]);

  const showPrompt = !!user && !user.isWorker && !user.workerPromptDismissed && !promptClosed;

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
        {/* Workers get jobs, not bookings — hide the tab for them. */}
        <Tabs.Screen
          name="bookings"
          options={{
            title: t('tabs.bookings'),
            tabBarIcon: tabIcon('calendar'),
            href: user?.isWorker ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubble-ellipses') }}
        />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
      </Tabs>

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
