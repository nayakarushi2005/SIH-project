import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { getWorkerInsights } from '../services/api';
import { traitLabel } from '../utils/traits';

function Chip({ label, tone }) {
  return (
    <View style={[styles.chip, tone === 'improve' ? styles.chipImprove : styles.chipGood]}>
      <Text style={[styles.chipText, tone === 'improve' ? styles.chipTextImprove : styles.chipTextGood]}>
        {label}
      </Text>
    </View>
  );
}

function improveLabel(t, item, bySlug) {
  if (item.type === 'skill') return t('insights.skillSuffix', { name: bySlug(item.id)?.name ?? item.id });
  return traitLabel(t, item.id, 'improve');
}

/** What clients' feedback says about this worker (from the knowledge graph). */
export default function WorkerInsightsCard() {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const [insights, setInsights] = useState(null);

  useFocusEffect(
    useCallback(() => {
      getWorkerInsights()
        .then(setInsights)
        .catch(() => {}); // keep whatever we showed last
    }, [])
  );

  if (!insights) return null;

  const { rating, completedJobs, strengths, improve, specialties = [] } = insights;

  return (
    <View style={styles.card}>
      <View style={styles.headline}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            <Ionicons name="star" size={18} color={colors.warning} />
            <Text style={styles.statValue}>{rating.average != null ? rating.average.toFixed(1) : '—'}</Text>
          </View>
          <Text style={styles.statLabel}>{t('insights.ratingCount', { count: rating.count })}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{completedJobs}</Text>
          <Text style={styles.statLabel}>{t('insights.jobsCompleted')}</Text>
        </View>
      </View>

      {rating.count === 0 ? (
        <Text style={styles.muted}>{t('insights.emptyBody')}</Text>
      ) : (
        <>
          {strengths.length > 0 ? (
            <>
              <Text style={styles.label}>{t('insights.strengths')}</Text>
              <View style={styles.chips}>
                {strengths.map((s) => (
                  <Chip key={s.trait} label={traitLabel(t, s.trait, 'good')} />
                ))}
              </View>
            </>
          ) : null}

          {specialties.length > 0 ? (
            <>
              <Text style={styles.label}>{t('insights.specialties')}</Text>
              <View style={styles.chips}>
                {specialties.map((s) => (
                  <Chip key={s.specialty} label={s.specialty.replace(/^./, (c) => c.toUpperCase())} />
                ))}
              </View>
            </>
          ) : null}

          {improve.length > 0 ? (
            <>
              <Text style={styles.label}>{t('insights.improve')}</Text>
              <View style={styles.chips}>
                {improve.map((i) => (
                  <Chip key={`${i.type}-${i.id}`} label={improveLabel(t, i, bySlug)} tone="improve" />
                ))}
              </View>
              <Text style={styles.muted}>{t('insights.coursesNote')}</Text>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  headline: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xs,
  },
  stat: {
    gap: 2,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  label: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  chipGood: {
    backgroundColor: colors.primarySoft,
  },
  chipImprove: {
    backgroundColor: colors.warningSoft,
  },
  chipText: {
    ...typography.label,
    fontWeight: '600',
  },
  chipTextGood: {
    color: colors.primary,
  },
  chipTextImprove: {
    color: colors.warning,
  },
  muted: {
    ...typography.label,
    color: colors.textMuted,
  },
});
