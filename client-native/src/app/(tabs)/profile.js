import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import AllJobsSheet from '../../components/AllJobsSheet';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import JobDetailSheet from '../../components/JobDetailSheet';
import PostedJobRow from '../../components/PostedJobRow';
import ScreenHeader from '../../components/ScreenHeader';
import { radius, spacing, typography } from '../../constants/theme';
import { makeStyles, useTheme } from '../../hooks/useTheme';
import useProfile from '../../hooks/useProfile';
import useTabBarSpace from '../../hooks/useTabBarSpace';
import { signOut } from '../../services/auth';
import { usePostedJobs } from '../../services/jobStore';
import {
  formatDOB,
  formatPhone,
  genderLabel,
  languageLabel,
  profileCompletion,
} from '../../utils/profile';

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return value ? new Date(value).toLocaleDateString('en-IN', options) : null;
}

function DetailRow({ label, value, last }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowValueEmpty]}>
        {value || 'Not added'}
      </Text>
    </View>
  );
}

function Section({ title, tag, children }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {tag ? <Text style={styles.sectionTag}>{tag}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, value, onValueChange, last }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.row, styles.toggleRow, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.textOnPrimary}
        accessibilityLabel={label}
      />
    </View>
  );
}

const RECENT_COUNT = 3;

export default function Profile() {
  const { colors, dark, setDark } = useTheme();
  const styles = useStyles();
  const postedJobs = usePostedJobs();
  const [selectedJob, setSelectedJob] = useState(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const router = useRouter();
  const { user, error, refreshing, refresh: onRefresh, reload: load } = useProfile();
  const tabBarSpace = useTabBarSpace();

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  }, [router]);

  const goToEdit = useCallback(() => router.push('/edit-profile'), [router]);
  const goToVerify = useCallback(() => router.push('/aadhaar-verify'), [router]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Profile" showBack={false} />
        <View style={styles.centered}>
          {error ? (
            <>
              <Text style={styles.errorText}>{error}</Text>
              <Button label="Try again" variant="secondary" onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const verified = user.isAadhaarVerified;
  const { done, total } = profileCompletion(user);
  const identityTag = verified
    ? 'From Aadhaar'
    : user.detailsSource === 'manual'
      ? 'Self-declared'
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Profile" showBack={false} actionLabel="Edit" onAction={goToEdit} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.identity}>
          <Avatar user={user} size={64} />
          <View style={styles.identityText}>
            <Text style={[styles.name, !user.name && styles.nameEmpty]} numberOfLines={2}>
              {user.name || 'Add your name'}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user.googleEmail}
            </Text>
          </View>
        </View>

        {done < total && (
          <View style={styles.completion}>
            <View style={styles.completionHeader}>
              <Text style={styles.completionTitle}>Complete your profile</Text>
              <Text style={styles.completionCount}>
                {done} of {total}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
            </View>
            <Text style={styles.completionText}>
              Add your phone number and address so workers can find and reach you.
            </Text>
          </View>
        )}

        {verified ? (
          <View style={[styles.status, styles.statusVerified]}>
            <View style={[styles.statusDot, styles.statusDotVerified]} />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>Aadhaar verified</Text>
              <Text style={styles.statusBody}>
                Verified via DigiLocker
                {user.aadhaarVerifiedAt ? ` on ${formatDate(user.aadhaarVerifiedAt)}` : ''}
                {user.aadhaarNumber ? `  ·  XXXX XXXX ${user.aadhaarNumber}` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.status, styles.statusPending]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, styles.statusDotPending]} />
              <Text style={[styles.statusTitle, styles.statusTitlePending]}>
                Aadhaar not verified
              </Text>
            </View>
            <Text style={styles.statusBody}>
              {user.detailsSource === 'manual'
                ? 'Your details are self-declared. Verify with DigiLocker to confirm them and get a verified badge.'
                : 'Verify with DigiLocker to get a verified badge, or add your details manually for now.'}
            </Text>
            <Button label="Verify with DigiLocker" onPress={goToVerify} style={styles.statusButton} />
            {user.detailsSource !== 'manual' && (
              <Button label="Enter details manually" variant="text" onPress={goToEdit} />
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Posted jobs</Text>
            {postedJobs.length ? <Text style={styles.sectionTag}>{postedJobs.length} total</Text> : null}
          </View>
          <View style={styles.jobsBody}>
            {postedJobs.length ? (
              <>
                {postedJobs.slice(0, RECENT_COUNT).map((job, i, list) => (
                  <PostedJobRow
                    key={job.id}
                    job={job}
                    onPress={() => setSelectedJob(job)}
                    last={i === list.length - 1 && postedJobs.length <= RECENT_COUNT}
                  />
                ))}
                {postedJobs.length > RECENT_COUNT ? (
                  <Pressable
                    onPress={() => setShowAllJobs(true)}
                    style={({ pressed }) => [styles.seeMore, pressed && styles.seeMorePressed]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.seeMoreText}>See more ({postedJobs.length - RECENT_COUNT} more)</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.jobsEmpty}>
                <Text style={styles.jobsEmptyText}>You have not posted any jobs yet.</Text>
                <Button label="Post a job" variant="text" onPress={() => router.push('/create-job')} />
              </View>
            )}
          </View>
        </View>

        <Section title="Personal details" tag={identityTag}>
          <DetailRow label="Full name" value={user.name} />
          <DetailRow label="Date of birth" value={formatDOB(user.dob)} />
          <DetailRow label="Gender" value={genderLabel(user.gender)} />
          <DetailRow label="Address" value={user.address} last />
        </Section>

        <Section title="Contact">
          <DetailRow label="Mobile number" value={formatPhone(user.phone)} />
          <DetailRow label="City" value={user.city} />
          <DetailRow label="PIN code" value={user.pincode} last />
        </Section>

        <Section title="Preferences">
          <DetailRow label="App language" value={languageLabel(user.preferredLanguage)} />
          <ToggleRow label="Dark mode" value={dark} onValueChange={setDark} last />
        </Section>

        <Button label="Sign out" variant="secondary" onPress={handleSignOut} style={styles.signOut} />

        {user.createdAt ? (
          <Text style={styles.footer}>
            Member since {formatDate(user.createdAt, { month: 'long', year: 'numeric' })}
          </Text>
        ) : null}
      </ScrollView>

      <AllJobsSheet
        visible={showAllJobs}
        jobs={postedJobs}
        onClose={() => setShowAllJobs(false)}
        onSelect={setSelectedJob}
      />
      <JobDetailSheet job={selectedJob} onClose={() => setSelectedJob(null)} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
  },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  identityText: {
    flex: 1,
  },
  name: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  nameEmpty: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  email: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
  },

  completion: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  completionTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  completionCount: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  completionText: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  status: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusVerified: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    backgroundColor: colors.primarySoft,
  },
  statusPending: {
    backgroundColor: colors.warningSoft,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginBottom: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotVerified: {
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  statusDotPending: {
    backgroundColor: colors.warning,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
  },
  statusTitlePending: {
    color: colors.warning,
  },
  statusBody: {
    ...typography.label,
    color: colors.text,
    marginTop: 2,
  },
  statusButton: {
    marginTop: spacing.md,
  },

  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTag: {
    ...typography.label,
    color: colors.textMuted,
  },
  sectionBody: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  toggleRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  jobsBody: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  seeMore: {
    alignItems: 'center',
    paddingVertical: spacing.sm + 6,
  },
  seeMorePressed: {
    backgroundColor: colors.primaryPressed,
  },
  seeMoreText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
  },
  jobsEmpty: {
    alignItems: 'center',
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.xs,
  },
  jobsEmptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '600',
    color: colors.text,
  },
  rowValueEmpty: {
    fontWeight: '400',
    color: colors.textMuted,
  },

  signOut: {
    marginBottom: spacing.md,
  },
  footer: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
  },
}));
