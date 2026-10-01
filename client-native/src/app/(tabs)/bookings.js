import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import JobCard from '../../components/JobCard';
import { colors, spacing, typography } from '../../constants/theme';
import { getErrorMessage, listJobs } from '../../services/api';

// While a job is still being matched or a worker is on the way, refresh so
// the client sees the worker accept, or the search end, without pulling.
const LIVE_POLL_MS = 10 * 1000;
const LIVE_STATUSES = ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS'];

export default function Bookings() {
  const router = useRouter();
  const { t } = useTranslation();
  const [jobs, setJobs] = useState(null); // null until the first load finishes
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, t('bookings.loadFailed')));
    }
  }, [t]);

  // Reload whenever the tab comes into view, e.g. right after posting a job,
  // and keep reloading while it's in view and some job is still live.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      load();
      return () => setFocused(false);
    }, [load])
  );

  const live = !!jobs?.some((job) => LIVE_STATUSES.includes(job.status));
  useEffect(() => {
    if (!focused || !live) return undefined;
    const poll = setInterval(load, LIVE_POLL_MS);
    return () => clearInterval(poll);
  }, [focused, live, load]);

  // A card cancelled or retried its job: show the new state right away.
  const jobChanged = useCallback(
    (next) => {
      if (next) setJobs((list) => list?.map((job) => (job.id === next.id ? next : job)) ?? list);
      else load();
    },
    [load]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const newJob = useCallback(() => router.push('/create-job'), [router]);
  const rateJob = useCallback(
    (job) => router.push({ pathname: '/feedback', params: { jobId: job.id } }),
    [router]
  );

  let body;
  if (jobs === null && !error) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (jobs === null) {
    body = (
      <EmptyState icon="cloud-offline-outline" title={t('bookings.loadError')} body={error}>
        <Button label={t('common.tryAgain')} variant="secondary" onPress={load} style={styles.button} />
      </EmptyState>
    );
  } else if (jobs.length === 0) {
    body = (
      <EmptyState
        icon="calendar-outline"
        title={t('bookings.emptyTitle')}
        body={t('bookings.emptyBody')}
      >
        <Button label={t('bookings.createJob')} onPress={newJob} style={styles.button} />
      </EmptyState>
    );
  } else {
    body = (
      <FlatList
        data={jobs}
        keyExtractor={(job) => String(job.id)}
        renderItem={({ item }) => <JobCard job={item} onRate={rateJob} onChanged={jobChanged} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('bookings.title')}</Text>
        {jobs?.length ? (
          <Pressable onPress={newJob} hitSlop={spacing.sm} style={styles.newJob} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.newJobText}>{t('bookings.newJob')}</Text>
          </Pressable>
        ) : null}
      </View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
  },
  title: { ...typography.heading, fontSize: 24, fontWeight: '800', color: colors.text },
  newJob: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  newJobText: { ...typography.body, fontWeight: '600', color: colors.primary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.lg - spacing.xs, paddingBottom: spacing.xl },
  separator: { height: spacing.sm + 4 },
  button: { marginTop: spacing.md, alignSelf: 'stretch' },
});
