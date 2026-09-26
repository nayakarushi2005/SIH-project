import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { radius, tabBar } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';

export const TABS = [
  { href: '/home', title: 'Home', icon: 'home' },
  { href: '/bookings', title: 'Bookings', icon: 'calendar' },
  { href: '/messages', title: 'Messages', icon: 'mail' },
  { href: '/profile', title: 'Profile', icon: 'person-circle' },
];

function TabButton({ tab, focused, onPress }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const scale = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      onPressIn={() => {
        scale.set(withSpring(0.78, { damping: 15, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 5, stiffness: 320, mass: 0.6 }));
      }}
      onPress={onPress}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.title}
      hitSlop={4}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={focused ? tab.icon : `${tab.icon}-outline`}
          size={26}
          color={focused ? colors.primary : colors.textMuted}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar({ blurTarget }) {
  const { dark } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={[styles.bar, { bottom: insets.bottom + tabBar.gap }]} accessibilityRole="tablist">
      <BlurView
        style={StyleSheet.absoluteFill}
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={dark ? 70 : 40}
        tint={dark ? 'dark' : 'light'}
      />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      {TABS.map((tab) => {
        const focused = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <TabButton
            key={tab.href}
            tab={tab}
            focused={focused}
            onPress={() => {
              if (!focused) router.navigate(tab.href);
            }}
          />
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    position: 'absolute',
    left: tabBar.inset,
    right: tabBar.inset,
    height: tabBar.height,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
    overflow: 'hidden',
    boxShadow: colors.shadowCard,
  },
  tint: {
    backgroundColor: colors.glassTint,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
