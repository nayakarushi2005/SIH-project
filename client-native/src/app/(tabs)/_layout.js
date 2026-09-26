import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../constants/theme';

function tabIcon(name) {
  // Filled icon when active, outline otherwise.
  function TabIcon({ color, focused, size }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
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
      <Tabs.Screen name="bookings" options={{ title: t('tabs.bookings'), tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen
        name="messages"
        options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubble-ellipses') }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
