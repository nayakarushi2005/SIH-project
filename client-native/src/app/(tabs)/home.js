import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Avatar from '../../components/Avatar';
import BannerCarousel from '../../components/BannerCarousel';
import EmptyState from '../../components/EmptyState';
import LocationSheet from '../../components/LocationSheet';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { BANNERS, MOST_BOOKED_SLUGS } from '../../constants/services';
import useCategories from '../../hooks/useCategories';
import useProfile from '../../hooks/useProfile';

const SIDE = spacing.lg - spacing.xs;

function SectionTitle({ children }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export default function Home() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, refreshing, refresh } = useProfile();
  const [locationOpen, setLocationOpen] = useState(false);
  const { bySlug } = useCategories(i18n.language);
  const mostBooked = MOST_BOOKED_SLUGS.map(bySlug).filter(Boolean);

  const startJob = useCallback(
    (serviceId) =>
      router.push(serviceId ? { pathname: '/create-job', params: { service: serviceId } } : '/create-job'),
    [router]
  );

  const banners = BANNERS.map((b) => ({
    ...b,
    title: t(`banners.${b.id}.title`),
    body: t(`banners.${b.id}.body`),
    cta: t(`banners.${b.id}.cta`),
  }));

  const location = user?.city
    ? [user.city, user.pincode].filter(Boolean).join(' ')
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* ── Header: location + actions ─────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setLocationOpen(true)}
          style={styles.location}
          accessibilityRole="button"
          accessibilityLabel={location ? t('home.locationA11y', { location }) : t('home.setLocation')}
        >
          <Text style={styles.locationLabel}>{t('home.yourLocation')}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-sharp" size={18} color={colors.primary} />
            <Text style={[styles.locationText, !location && styles.locationEmpty]} numberOfLines={1}>
              {location || t('home.setLocation')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.text} />
          </View>
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            hitSlop={spacing.xs}
            accessibilityRole="button"
            accessibilityLabel={t('home.notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => router.navigate('/profile')}
            style={({ pressed }) => pressed && styles.pressed}
            hitSlop={spacing.xs}
            accessibilityRole="button"
            accessibilityLabel={t('home.profile')}
          >
            <Avatar user={user} size={40} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        {/* ── Create a new job ───────────────────────────────────────── */}
        <Pressable
          onPress={() => startJob(null)}
          style={({ pressed }) => [styles.createJob, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('home.createJob')}
        >
          <View style={styles.createJobIcon}>
            <Ionicons name="add" size={26} color={colors.primary} />
          </View>
          <View style={styles.createJobText}>
            <Text style={styles.createJobTitle}>{t('home.createJob')}</Text>
            <Text style={styles.createJobBody}>{t('home.createJobBody')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textOnPrimary} />
        </Pressable>

        {/* ── Most booked ────────────────────────────────────────────── */}
        <SectionTitle>{t('home.mostBooked')}</SectionTitle>
        <View style={styles.grid}>
          {mostBooked.map((service) => (
            <Pressable
              key={service.slug}
              onPress={() => startJob(service.slug)}
              style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('home.bookA11y', { name: service.name })}
            >
              <View style={styles.serviceTile}>
                <MaterialCommunityIcons name={service.icon} size={36} color={colors.primary} />
              </View>
              <Text style={styles.serviceLabel}>{service.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Trending ───────────────────────────────────────────────── */}
        <SectionTitle>{t('home.trending')}</SectionTitle>
        <View style={styles.bleed}>
          <BannerCarousel banners={banners} inset={SIDE} onPress={(b) => startJob(b.serviceId)} />
        </View>

        {/* ── Book again ─────────────────────────────────────────────── */}
        <SectionTitle>{t('home.bookAgain')}</SectionTitle>
        <EmptyState
          compact
          icon="time-outline"
          body={t('home.bookAgainEmpty')}
        />
      </ScrollView>
      <LocationSheet visible={locationOpen} onClose={() => setLocationOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.85,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
  },
  location: {
    flex: 1,
  },
  locationLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  locationText: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  locationEmpty: {
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },

  content: {
    paddingHorizontal: SIDE,
    paddingBottom: spacing.xl,
  },

  // Create job
  createJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  createJobIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  createJobText: {
    flex: 1,
  },
  createJobTitle: {
    ...typography.button,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  createJobBody: {
    ...typography.label,
    color: colors.textOnPrimary,
    opacity: 0.85,
    marginTop: 2,
  },

  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg + spacing.xs,
    marginBottom: spacing.sm + 4,
  },

  // Most booked
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  serviceCard: {
    width: '48%',
  },
  serviceTile: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  serviceLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },

  bleed: {
    marginHorizontal: -SIDE,
  },
});
