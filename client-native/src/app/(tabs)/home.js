import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Plus, Toolbox } from 'lucide-react-native';

import BannerCarousel from '../../components/BannerCarousel';
import IconTile from '../../components/IconTile';
import ServiceTile from '../../components/ServiceTile';
import { radius, spacing, typography } from '../../constants/theme';
import { makeStyles, useTheme } from '../../hooks/useTheme';
import { BANNERS, MOST_BOOKED, getService } from '../../constants/services';
import useDeviceLocation from '../../hooks/useDeviceLocation';
import useProfile from '../../hooks/useProfile';
import useTabBarSpace from '../../hooks/useTabBarSpace';
import { getRecentJobs } from '../../services/session';

const SIDE = spacing.lg - spacing.xs;

const LOCATION_PROMPTS = {
  loading: 'Finding your location…',
  denied: 'Allow location access',
  blocked: 'Allow location in Settings',
  off: 'Turn on location services',
  error: 'Location unavailable, tap to retry',
};

function SectionTitle({ children }) {
  const styles = useStyles();
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

function formatJobDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Home() {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const { user, refreshing, refresh } = useProfile();
  const location = useDeviceLocation();
  const [recentJobs, setRecentJobs] = useState([]);

  const loadRecentJobs = useCallback(async () => {
    try {
      setRecentJobs(await getRecentJobs());
    } catch {
      setRecentJobs([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecentJobs();
      StatusBar.setStyle('light');
      return () => StatusBar.setStyle(dark ? 'light' : 'dark');
    }, [dark, loadRecentJobs])
  );

  const onRefresh = useCallback(() => {
    loadRecentJobs();
    return refresh();
  }, [loadRecentJobs, refresh]);

  const startJob = useCallback(
    (params) => router.push(params ? { pathname: '/create-job', params } : '/create-job'),
    [router]
  );

  const profileCity = user?.city ? [user.city, user.pincode].filter(Boolean).join(' ') : null;
  const locationText =
    location.status === 'ready'
      ? location.label || profileCity || 'Current location'
      : (location.status === 'error' && profileCity) || LOCATION_PROMPTS[location.status];
  const locationNeedsAction = location.status !== 'ready' && location.status !== 'loading';

  return (
    <View style={styles.container}>
      <View style={[styles.statusBarFill, { height: insets.top }]} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textOnPrimary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroOverscroll} />

          <View style={styles.heroTop}>
            <Pressable
              onPress={location.request}
              style={({ pressed }) => [styles.location, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={
                location.status === 'ready' ? `Location: ${locationText}. Refresh` : locationText
              }
            >
              <Ionicons name="location-outline" size={24} color={colors.textOnPrimary} />
              <View style={styles.locationText}>
                <Text style={styles.locationLabel}>Your location</Text>
                <View style={styles.locationRow}>
                  <Text
                    style={[styles.locationValue, locationNeedsAction && styles.locationAction]}
                    numberOfLines={1}
                  >
                    {locationText}
                  </Text>
                  {location.status === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.textOnPrimary} />
                  ) : (
                    <Ionicons name="chevron-down" size={16} color={colors.textOnPrimary} />
                  )}
                </View>
              </View>
            </Pressable>

            <Pressable
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              hitSlop={spacing.xs}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textOnPrimary} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => startJob(null)}
            style={({ pressed }) => [styles.createJob, pressed && styles.createJobPressed]}
            accessibilityRole="button"
            accessibilityLabel="Create a new job"
          >
            <IconTile icon={Plus} color={colors.primary} size={34} round />
            <Text style={styles.createJobTitle}>Create a new job</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <SectionTitle>Most booked</SectionTitle>
          <View style={styles.grid}>
            {MOST_BOOKED.map((service) => (
              <ServiceTile
                key={service.id}
                icon={service.icon}
                color={service.color}
                outline
                label={service.label}
                onPress={() => startJob({ service: service.id })}
                accessibilityLabel={`Book ${service.label}`}
              />
            ))}
          </View>

          <SectionTitle>Trending</SectionTitle>
          <View style={styles.bleed}>
            <BannerCarousel
              banners={BANNERS}
              inset={SIDE}
              onPress={(b) => startJob({ service: b.serviceId, title: b.jobTitle })}
            />
          </View>

          <SectionTitle>Book again</SectionTitle>
          {recentJobs.length ? (
            <View style={styles.grid}>
              {recentJobs.map((job) => {
                const service = getService(job.serviceId);
                const label = job.title || service?.label || 'Job';
                const caption = `${job.status === 'completed' ? 'Completed' : 'Posted'} · ${formatJobDate(job.updatedAt)}`;
                return (
                  <ServiceTile
                    key={job.id}
                    icon={service?.icon ?? Toolbox}
                    color={service?.color}
                    label={label}
                    caption={caption}
                    onPress={() => startJob({ service: job.serviceId })}
                    accessibilityLabel={`Book again: ${label}. ${caption}`}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.noJobs}>
              <IconTile icon={Toolbox} color="#94A3B8" size={52} />
              <Text style={styles.noJobsTitle}>No previous jobs</Text>
              <Text style={styles.noJobsBody}>
                Jobs you post or complete will show up here so you can book them again in one tap.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarFill: {
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },

  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    boxShadow: colors.shadowCard,
  },
  heroOverscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    height: 1000,
    backgroundColor: colors.primary,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  location: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationText: {
    flex: 1,
  },
  locationLabel: {
    ...typography.label,
    color: colors.textOnPrimary,
    opacity: 0.8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationValue: {
    ...typography.button,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.textOnPrimary,
    flexShrink: 1,
  },
  locationAction: {
    textDecorationLine: 'underline',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  createJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md + 4,
    boxShadow: colors.shadowRaised,
  },
  createJobPressed: {
    backgroundColor: colors.primarySoft,
  },
  createJobTitle: {
    ...typography.button,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  content: {
    paddingHorizontal: SIDE,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  bleed: {
    marginHorizontal: -SIDE,
    marginBottom: -spacing.md,
  },

  noJobs: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    boxShadow: colors.shadowSoft,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  noJobsTitle: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  noJobsBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
}));
