import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';

import Button from '../../components/Button';
import JobCard from '../../components/JobCard';
import SwipeDeck from '../../components/SwipeDeck';
import { DUMMY_JOBS } from '../../constants/dummyJobs';
import { radius, spacing, typography } from '../../constants/theme';
import { makeStyles, useTheme } from '../../hooks/useTheme';
import useTabBarSpace from '../../hooks/useTabBarSpace';
import { getWorkerMode, setWorkerMode } from '../../services/session';

const SIDE = spacing.lg - spacing.xs;

function WorkerSwitch({ value, onValueChange, onDark }) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: onDark ? 'rgba(0, 0, 0, 0.35)' : colors.border, true: 'rgba(255, 255, 255, 0.55)' }}
      thumbColor={colors.background}
      ios_backgroundColor={onDark ? 'rgba(0, 0, 0, 0.35)' : colors.border}
      accessibilityLabel="Worker profile"
    />
  );
}

function EnableSheet({ onEnable, bottomSpace }) {
  const styles = useStyles();
  const [translateY] = useState(() => new Animated.Value(400));

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }).start();
  }, [translateY]);

  return (
    <Animated.View style={[styles.sheet, { paddingBottom: bottomSpace, transform: [{ translateY }] }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetRow}>
        <View style={styles.sheetText}>
          <Text style={styles.sheetTitle}>Enable worker profile now?</Text>
          <Text style={styles.sheetBody}>
            Get matched with jobs near you that fit your skills. You can switch it off anytime.
          </Text>
        </View>
        <WorkerSwitch value={false} onValueChange={onEnable} onDark />
      </View>
    </Animated.View>
  );
}

export default function Bookings() {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const [workerMode, setMode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getWorkerMode()
      .catch(() => false)
      .then((enabled) => {
        if (!cancelled) setMode(enabled);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setStyle(workerMode || dark ? 'light' : 'dark');
      return () => StatusBar.setStyle(dark ? 'light' : 'dark');
    }, [dark, workerMode])
  );

  const changeMode = useCallback((enabled) => {
    setMode(enabled);
    setWorkerMode(enabled).catch(() => {});
  }, []);

  const joinFederation = useCallback(() => {
    Alert.alert('Federations', 'Joining a workers federation is coming soon.');
  }, []);

  if (workerMode === null) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!workerMode) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={[styles.sectionTitle, styles.offTitle]} accessibilityRole="header">
          Recommended jobs
        </Text>
        <View style={styles.offMessage}>
          <Text style={styles.offText}>Turn on worker profile now!</Text>
        </View>
        <EnableSheet onEnable={() => changeMode(true)} bottomSpace={tabBarSpace} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.statusBarFill, { height: insets.top }]} />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Worker profile
          </Text>
          <WorkerSwitch value onValueChange={changeMode} />
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>Federation</Text>
          <Pressable
            onPress={joinFederation}
            style={({ pressed }) => [styles.joinFed, pressed && styles.pressed]}
            accessibilityRole="button"
            hitSlop={spacing.sm}
          >
            <Text style={styles.joinFedText}>Join a fed now!</Text>
            <ChevronRight size={16} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.sectionTitle, styles.onTitle]} accessibilityRole="header">
        Recommended jobs
      </Text>

      <View style={[styles.deck, { paddingBottom: tabBarSpace }]}>
        <SwipeDeck
          items={DUMMY_JOBS}
          renderCard={(job) => <JobCard job={job} />}
          renderEmpty={(reset) => (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>You are all caught up</Text>
              <Text style={styles.emptyBody}>New jobs near you will show up here.</Text>
              <Button label="Show jobs again" variant="secondary" onPress={reset} style={styles.emptyButton} />
            </View>
          )}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  statusBarFill: {
    backgroundColor: colors.primary,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm + 4,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    boxShadow: colors.shadowCard,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitle: {
    ...typography.title,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  headerLabel: {
    ...typography.button,
    fontWeight: '600',
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
  joinFed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  joinFedText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: SIDE,
  },
  onTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  offTitle: {
    marginTop: spacing.md,
  },
  deck: {
    flex: 1,
    paddingHorizontal: SIDE,
  },
  offMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 260,
  },
  offText: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    color: colors.textMuted,
    opacity: 0.6,
    textAlign: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm + 4,
    boxShadow: colors.shadowSheet,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginBottom: spacing.md + 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sheetText: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  sheetTitle: {
    ...typography.title,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  sheetBody: {
    ...typography.body,
    color: colors.textOnPrimary,
    opacity: 0.85,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.md,
  },
}));
