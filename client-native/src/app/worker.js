import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import WorkerInsightsCard from '../components/WorkerInsightsCard';
import WorkerJobCard from '../components/WorkerJobCard';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { useWorkerMode } from '../context/WorkerMode';
import { getErrorMessage, isAadhaarRequired } from '../services/api';

/** Worker dashboard: go online, see the active job, manage the work profile. */
export default function WorkerHome() {
  const { i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const router = useRouter();
  const { profile, online, refresh, goOnline, goOffline } = useWorkerMode();
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const toggleOnline = useCallback(async () => {
    setToggling(true);
    try {
      if (online) await goOffline();
      else await goOnline();
    } catch (err) {
      if (isAadhaarRequired(err)) {
        Alert.alert('Verify your Aadhaar', getErrorMessage(err), [
          { text: 'Not now', style: 'cancel' },
          { text: 'Verify', onPress: () => router.push('/aadhaar-verify') },
        ]);
      } else {
        Alert.alert(online ? 'Could not go offline' : 'Could not go online', getErrorMessage(err));
      }
    } finally {
      setToggling(false);
    }
  }, [goOffline, goOnline, online, router]);

  const header = <ScreenHeader title="Worker mode" fallbackHref="/profile" />;

  if (profile === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {header}
        {/* Registering is the onboarding flow (form or voice); going online
            later asks for Aadhaar verification if it's still missing. */}
        <EmptyState
          icon="briefcase-outline"
          title="Earn with jobs near you"
          body="Register the work you do, go online, and accept the job requests you want."
        >
          <Button
            label="Become a worker"
            onPress={() => router.push('/worker-onboarding')}
            style={styles.stretch}
          />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const skills = profile.skills.map((id) => bySlug(id)?.name ?? id).join(', ');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Online status ──────────────────────────────────────── */}
        <View style={[styles.status, online && styles.statusOnline]}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, online && styles.dotOnline]} />
            <Text style={styles.statusTitle}>{online ? 'You’re online' : 'You’re offline'}</Text>
          </View>
          <Text style={styles.statusBody}>
            {profile.currentJob
              ? 'Finish your current job to get new requests.'
              : online
                ? 'Waiting for job requests. Keep the app open — requests pop up here and stay open for 20 minutes.'
                : 'Go online to start getting job requests near you.'}
          </Text>
          <Button
            label={online ? 'Go offline' : 'Go online'}
            variant={online ? 'secondary' : 'primary'}
            onPress={toggleOnline}
            loading={toggling}
          />
        </View>

        {/* ── Current job ────────────────────────────────────────── */}
        {profile.currentJob ? (
          <>
            <Text style={styles.sectionTitle}>Current job</Text>
            <WorkerJobCard jobId={profile.currentJob} onChanged={refresh} />
          </>
        ) : null}

        {/* ── Feedback insights (knowledge graph) ────────────────── */}
        <Text style={styles.sectionTitle}>What clients say</Text>
        <WorkerInsightsCard />

        {/* ── Work profile ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Work profile</Text>
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Ionicons name="construct-outline" size={18} color={colors.textMuted} />
            <Text style={styles.summaryText}>{skills}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="navigate-outline" size={18} color={colors.textMuted} />
            <Text style={styles.summaryText}>Jobs within {profile.serviceRadiusKm} km</Text>
          </View>
          <Button
            label="Edit work profile"
            variant="text"
            onPress={() => router.push('/worker-profile')}
            style={styles.editButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stretch: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.sm + 4,
  },
  status: {
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  statusOnline: {
    backgroundColor: colors.primarySoft,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textMuted,
  },
  dotOnline: {
    backgroundColor: colors.primary,
  },
  statusTitle: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  statusBody: {
    ...typography.body,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  summary: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  editButton: {
    alignSelf: 'flex-start',
  },
});
