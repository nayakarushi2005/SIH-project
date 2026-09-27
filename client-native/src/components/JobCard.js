import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Avatar from './Avatar';
import Button from './Button';
import RetryJobSheet from './RetryJobSheet';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { cancelJob, getErrorMessage, retryJob } from '../services/api';
import { formatCountdown, formatDuration, formatPrice, jobStatus, thumbnailUrl } from '../utils/job';
import { localeTag } from '../i18n/language';

const TONES = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  muted: { bg: colors.surface, fg: colors.textMuted },
};

/** Who accepted the job: photo, name, verification, track record, and masked phone. */
function WorkerInfo({ worker }) {
  const { t } = useTranslation();
  const facts = [
    worker.rating.average != null
      ? t('jobCard.workerRating', { rating: worker.rating.average, count: worker.rating.count })
      : t('jobCard.workerNew'),
    t('jobCard.workerJobs', { count: worker.completedJobs }),
    worker.experienceYears != null ? t('jobCard.workerExperience', { count: worker.experienceYears }) : null,
  ].filter(Boolean);

  return (
    <View style={styles.worker}>
      <Avatar user={{ name: worker.name, googleAvatar: worker.photo }} size={40} />
      <View style={styles.workerBody}>
        <View style={styles.workerNameRow}>
          <Text style={styles.workerName} numberOfLines={1}>
            {worker.name ?? t('jobCard.workerFallbackName')}
          </Text>
          {worker.aadhaarVerified ? (
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={colors.primary}
              accessibilityLabel={t('jobCard.workerVerified')}
            />
          ) : null}
        </View>
        <Text style={styles.meta}>{facts.join(' · ')}</Text>
        {worker.phoneMasked ? (
          <View style={styles.workerNameRow}>
            <Ionicons name="call-outline" size={12} color={colors.textMuted} />
            <Text style={styles.meta}>{worker.phoneMasked}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Summary row for one of the client's posted jobs: the search countdown,
 * the worker once someone accepts, and what to do if nobody did.
 * `onRate(job)` rates a completed one; `onChanged(job)` gets the job after
 * the client cancels or retries it.
 */
export default function JobCard({ job, onRate, onChanged }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(null); // 'cancel' | 'retry'
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { bySlug } = useCategories(i18n.language);
  const service = bySlug(job.category);
  const status = jobStatus(job.status);
  const statusLabel = status.key ? t(status.key) : status.label;
  const tone = TONES[status.tone];
  const photo = job.photos?.[0];

  const searchLeft = job.searchDeadline ? new Date(job.searchDeadline).getTime() - now : 0;
  const searching = job.status === 'SEARCHING';
  useEffect(() => {
    if (!searching) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [searching]);

  const cancel = () => {
    Alert.alert(t('jobCard.cancelConfirmTitle'), t('jobCard.cancelConfirmBody'), [
      { text: t('jobCard.keepJob'), style: 'cancel' },
      {
        text: t('jobCard.cancelJob'),
        style: 'destructive',
        onPress: async () => {
          setBusy('cancel');
          try {
            onChanged?.(await cancelJob(job.id));
          } catch (err) {
            Alert.alert(t('jobCard.cancelFailedTitle'), getErrorMessage(err));
            onChanged?.();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const searchAgain = async () => {
    setBusy('retry');
    try {
      onChanged?.(await retryJob(job.id));
    } catch (err) {
      Alert.alert(t('jobCard.retryFailedTitle'), getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      {photo ? (
        <Image source={{ uri: thumbnailUrl(photo) }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <MaterialCommunityIcons name={service?.icon ?? 'tools'} size={28} color={colors.primary} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.service} numberOfLines={1}>
            {service?.name ?? job.category}
          </Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {job.description}
        </Text>
        <Text style={styles.meta}>
          {formatPrice(job.price)} · {formatDuration(job.expectedDurationMins)} ·{' '}
          {new Date(job.createdAt).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' })}
        </Text>
        {searching ? (
          <View style={styles.searching}>
            <Ionicons name="search" size={14} color={colors.warning} />
            <Text style={styles.searchingText}>
              {searchLeft > 0
                ? t('jobCard.searchingFor', { time: formatCountdown(searchLeft) })
                : t('jobCard.searchingEnding')}
            </Text>
          </View>
        ) : null}
        {job.worker && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status) ? (
          <WorkerInfo worker={job.worker} />
        ) : null}
        {job.startCode ? (
          <View
            style={styles.code}
            accessibilityLabel={t('jobCard.startCodeA11y', { code: job.startCode.split('').join(' ') })}
          >
            <Text style={styles.codeLabel}>{t('jobCard.startCode')}</Text>
            <Text style={styles.codeValue}>{job.startCode}</Text>
            <Text style={styles.codeHint}>{t('jobCard.startCodeHint')}</Text>
          </View>
        ) : null}
        {job.status === 'COMPLETED' ? (
          job.feedbackGiven ? (
            <View style={styles.rated}>
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              <Text style={styles.ratedText}>{t('jobCard.rated')}</Text>
            </View>
          ) : onRate ? (
            <Button
              label={t('jobCard.rateButton')}
              variant="secondary"
              onPress={() => onRate(job)}
              style={styles.rate}
            />
          ) : null
        ) : null}
        {job.status === 'EXPIRED' ? (
          <View style={styles.expired}>
            <Text style={styles.expiredText}>{t('jobCard.expiredBody')}</Text>
            <View style={styles.row}>
              <Button
                label={t('jobCard.searchAgain')}
                onPress={searchAgain}
                loading={busy === 'retry'}
                disabled={!!busy}
                style={styles.rowButton}
              />
              <Button
                label={t('jobCard.raisePrice')}
                variant="secondary"
                onPress={() => setEditing(true)}
                disabled={!!busy}
                style={styles.rowButton}
              />
            </View>
          </View>
        ) : null}
        {['SEARCHING', 'ASSIGNED'].includes(job.status) && onChanged ? (
          <Button
            label={t('jobCard.cancelJob')}
            variant="text"
            onPress={cancel}
            loading={busy === 'cancel'}
            disabled={!!busy}
            style={styles.cancel}
          />
        ) : null}
      </View>
      {editing && job.status === 'EXPIRED' ? (
        <RetryJobSheet
          job={job}
          onClose={() => setEditing(false)}
          onDone={(next) => {
            setEditing(false);
            onChanged?.(next);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  service: {
    ...typography.body,
    flexShrink: 1,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  badgeText: {
    ...typography.label,
    fontWeight: '600',
  },
  description: {
    ...typography.body,
    color: colors.text,
  },
  meta: {
    ...typography.label,
    color: colors.textMuted,
  },
  code: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  codeLabel: {
    ...typography.label,
    fontWeight: '600',
    color: colors.primary,
  },
  codeValue: {
    ...typography.title,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.text,
  },
  codeHint: {
    ...typography.label,
    color: colors.textMuted,
  },
  rate: {
    marginTop: spacing.xs,
    minHeight: 40,
  },
  rated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  ratedText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.primary,
  },
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchingText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.warning,
    fontVariant: ['tabular-nums'],
  },
  worker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  workerBody: {
    flex: 1,
    gap: 2,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  workerName: {
    ...typography.body,
    flexShrink: 1,
    fontWeight: '700',
    color: colors.text,
  },
  expired: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  expiredText: {
    ...typography.label,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowButton: {
    flex: 1,
    minHeight: 40,
  },
  cancel: {
    alignSelf: 'flex-start',
  },
});
