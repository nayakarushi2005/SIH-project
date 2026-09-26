import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import LanguageSheet from '../../components/LanguageSheet';
import ScreenHeader from '../../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../../constants/theme';
import useCategories from '../../hooks/useCategories';
import { useUser } from '../../context/UserContext';
import useProfile from '../../hooks/useProfile';
import i18n from '../../i18n';
import { localeTag, setAppLanguage } from '../../i18n/language';
import { deregisterWorker } from '../../services/api';
import { signOut } from '../../services/auth';
import {
  formatDOB,
  formatPhone,
  genderLabel,
  languageLabel,
  profileCompletion,
} from '../../utils/profile';

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return value ? new Date(value).toLocaleDateString(localeTag(), options) : null;
}

function DetailRow({ label, value, last, onPress }) {
  const content = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, !value && styles.rowValueEmpty]}>
          {value || i18n.t('common.notAdded')}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={[styles.row, last && styles.rowLast]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {content}
    </Pressable>
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
  const { t, i18n: i18next } = useTranslation();
  const { bySlug } = useCategories(i18next.language);
  const { user, setUser, error, refreshing, refresh: onRefresh, reload: load } = useProfile();
  const { clear } = useUser();
  const [languageOpen, setLanguageOpen] = useState(false);

  const chooseLanguage = useCallback(
    async (code) => {
      setLanguageOpen(false);
      try {
        const updated = await setAppLanguage(code);
        setUser(updated);
      } catch {
        Alert.alert(t('common.error'), t('language.saveFailed'));
      }
    },
    [setUser, t]
  );

  const handleDeregister = useCallback(() => {
    Alert.alert(t('workerProfile.deregisterConfirmTitle'), t('workerProfile.deregisterConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('workerProfile.deregister'),
        style: 'destructive',
        onPress: async () => {
          try {
            setUser(await deregisterWorker());
          } catch {
            Alert.alert(t('common.error'), t('workerProfile.deregisterFailed'));
          }
        },
      },
    ]);
  }, [setUser, t]);

  const handleSignOut = useCallback(() => {
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clear();
          router.replace('/auth');
        },
      },
    ]);
  }, [clear, router, t]);

  const goToEdit = useCallback(() => router.push('/edit-profile'), [router]);
  const goToVerify = useCallback(() => router.push('/aadhaar-verify'), [router]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <ScreenHeader title={t('profile.title')} showBack={false} />
        <View style={styles.centered}>
          {error ? (
            <>
              <Text style={styles.errorText}>{error}</Text>
              <Button label={t('common.tryAgain')} variant="secondary" onPress={load} />
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
    ? t('profile.tagAadhaar')
    : user.detailsSource === 'manual'
      ? t('profile.tagSelf')
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScreenHeader
        title={t('profile.title')}
        showBack={false}
        actionLabel={t('profile.edit')}
        onAction={goToEdit}
      />

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
              {user.name || t('profile.addName')}
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
              <Text style={styles.completionTitle}>{t('profile.completeTitle')}</Text>
              <Text style={styles.completionCount}>{t('profile.completeCount', { done, total })}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
            </View>
            <Text style={styles.completionText}>
              {t('profile.completeBody')}
            </Text>
          </View>
        )}

        {/* ── Verification ───────────────────────────────────────────── */}
        {verified ? (
          <View style={[styles.status, styles.statusVerified]}>
            <View style={[styles.statusDot, styles.statusDotVerified]} />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{t('profile.verifiedTitle')}</Text>
              <Text style={styles.statusBody}>
                {user.aadhaarVerifiedAt
                  ? t('profile.verifiedOn', { date: formatDate(user.aadhaarVerifiedAt) })
                  : t('profile.verifiedVia')}
                {user.aadhaarNumber ? `  ·  XXXX XXXX ${user.aadhaarNumber}` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.status, styles.statusPending]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, styles.statusDotPending]} />
              <Text style={[styles.statusTitle, styles.statusTitlePending]}>
                {t('profile.notVerifiedTitle')}
              </Text>
            </View>
            <Text style={styles.statusBody}>
              {user.detailsSource === 'manual'
                ? t('profile.notVerifiedManual')
                : t('profile.notVerifiedEmpty')}
            </Text>
            <Button label={t('profile.verifyButton')} onPress={goToVerify} style={styles.statusButton} />
            {user.detailsSource !== 'manual' && (
              <Button label={t('profile.enterManually')} variant="text" onPress={goToEdit} />
            )}
          </View>
        )}

        {/* ── Details ────────────────────────────────────────────────── */}
        <Section title={t('profile.personal')} tag={identityTag}>
          <DetailRow label={t('profile.fullName')} value={user.name} />
          <DetailRow label={t('profile.dob')} value={formatDOB(user.dob)} />
          <DetailRow label={t('profile.gender')} value={genderLabel(user.gender)} />
          <DetailRow label={t('profile.address')} value={user.address} last />
        </Section>

        {user.isWorker ? (
          <Section title={t('workerProfile.section')}>
            <DetailRow
              label={t('workerProfile.categories')}
              value={user.worker.categories
                .map(bySlug)
                .filter(Boolean)
                .map((c) => c.name)
                .join(', ')}
            />
            <DetailRow
              label={t('workerProfile.income')}
              value={user.worker.incomeBracket ? t(`income.${user.worker.incomeBracket}`) : null}
              last
            />
          </Section>
        ) : null}

        <Section title={t('profile.contact')}>
          <DetailRow label={t('profile.mobile')} value={formatPhone(user.phone)} />
          <DetailRow label={t('profile.city')} value={user.city} />
          <DetailRow label={t('profile.pincode')} value={user.pincode} last />
        </Section>

        <Section title={t('profile.preferences')}>
          <DetailRow
            label={t('profile.appLanguage')}
            value={languageLabel(user.preferredLanguage)}
            onPress={() => setLanguageOpen(true)}
            last
          />
        </Section>

        <Text style={styles.sectionTitleStandalone}>{t('workerProfile.settings')}</Text>
        {user.isWorker ? (
          <Button
            label={t('workerProfile.deregister')}
            variant="danger"
            onPress={handleDeregister}
            style={styles.workerAction}
          />
        ) : (
          <Button
            label={t('workerProfile.register')}
            variant="secondary"
            onPress={() => router.push('/worker-onboarding')}
            style={styles.workerAction}
          />
        )}

        <Button
          label={t('profile.signOut')}
          variant="secondary"
          onPress={handleSignOut}
          style={styles.signOut}
        />

        {user.createdAt ? (
          <Text style={styles.footer}>
            {t('profile.memberSince', {
              date: formatDate(user.createdAt, { month: 'long', year: 'numeric' }),
            })}
          </Text>
        ) : null}
      </ScrollView>

      <LanguageSheet
        visible={languageOpen}
        value={user.preferredLanguage}
        onClose={() => setLanguageOpen(false)}
        onSelect={chooseLanguage}
      />
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
  rowPressed: {
    opacity: 0.6,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: spacing.xs,
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

  sectionTitleStandalone: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  workerAction: {
    marginBottom: spacing.lg,
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
