import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { formatDuration, formatPrice, jobStatus, thumbnailUrl } from '../utils/job';

const TONES = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  muted: { bg: colors.surface, fg: colors.textMuted },
};

/** Summary row for one of the client's posted jobs. `onRate(job)` rates a completed one. */
export default function JobCard({ job, onRate }) {
  const { i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const service = bySlug(job.category);
  const status = jobStatus(job.status);
  const tone = TONES[status.tone];
  const photo = job.photos?.[0];

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
            <Text style={[styles.badgeText, { color: tone.fg }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {job.description}
        </Text>
        <Text style={styles.meta}>
          {formatPrice(job.price)} · {formatDuration(job.expectedDurationMins)} ·{' '}
          {new Date(job.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </Text>
        {job.startCode ? (
          <View style={styles.code} accessibilityLabel={`Start code ${job.startCode.split('').join(' ')}`}>
            <Text style={styles.codeLabel}>Start code</Text>
            <Text style={styles.codeValue}>{job.startCode}</Text>
            <Text style={styles.codeHint}>Share it with the worker when they arrive.</Text>
          </View>
        ) : null}
        {job.status === 'COMPLETED' ? (
          job.feedbackGiven ? (
            <View style={styles.rated}>
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              <Text style={styles.ratedText}>You rated this job</Text>
            </View>
          ) : onRate ? (
            <Button label="Rate your worker" variant="secondary" onPress={() => onRate(job)} style={styles.rate} />
          ) : null
        ) : null}
      </View>
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
});
