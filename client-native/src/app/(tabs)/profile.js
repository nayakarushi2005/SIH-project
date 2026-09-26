import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ScreenHeader from '../../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../../constants/theme';
import useProfile from '../../hooks/useProfile';
import { signOut } from '../../services/auth';
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

export default function Profile() {
  const router = useRouter();
  const { user, error, refreshing, refresh: onRefresh, reload: load } = useProfile();

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
        <StatusBar style="dark" />
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
      <StatusBar style="dark" />
      <ScreenHeader title="Profile" showBack={false} actionLabel="Edit" onAction={goToEdit} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Identity ───────────────────────────────────────────────── */}
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

        {/* ── Completion ─────────────────────────────────────────────── */}
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

        {/* ── Verification ───────────────────────────────────────────── */}
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

        {/* ── Details ────────────────────────────────────────────────── */}
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
          <DetailRow label="App language" value={languageLabel(user.preferredLanguage)} last />
        </Section>

        <Pressable
          onPress={() => router.push('/worker')}
          style={({ pressed }) => [styles.workCard, pressed && styles.workCardPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="briefcase-outline" size={22} color={colors.primary} />
          <View style={styles.workCardText}>
            <Text style={styles.workCardTitle}>Worker mode</Text>
            <Text style={styles.workCardBody}>Take jobs near you and earn</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Button label="Sign out" variant="secondary" onPress={handleSignOut} style={styles.signOut} />

        {user.createdAt ? (
          <Text style={styles.footer}>
            Member since {formatDate(user.createdAt, { month: 'long', year: 'numeric' })}
          </Text>
        ) : null}
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

  // Identity
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

  // Completion
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

  // Verification
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

  // Sections
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

  workCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  workCardPressed: {
    opacity: 0.8,
  },
  workCardText: {
    flex: 1,
  },
  workCardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  workCardBody: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: 2,
  },
  signOut: {
    marginBottom: spacing.md,
  },
  footer: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
