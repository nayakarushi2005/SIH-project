import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';
import { getAvailabilityHeatmap, getDemandHeatmap } from '../services/heatmap';
import { formatHourRange, quietCoords } from '../utils/heatmap';

/**
 * Home-screen teaser for the heatmap: a one-line summary and a tap into the
 * full map. mode 'demand' (worker hub) or 'availability' (client home).
 * Never asks for location itself — without it, it's just the entry point.
 */
export default function HeatmapCard({ mode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [summary, setSummary] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const here = await quietCoords();
        if (!here) return;
        try {
          const data =
            mode === 'demand'
              ? await getDemandHeatmap({ ...here, window: '7d' })
              : await getAvailabilityHeatmap(here);
          if (live) setSummary(data.summary);
        } catch {
          // keep whatever we showed last
        }
      })();
      return () => {
        live = false;
      };
    }, [mode])
  );

  const demand = mode === 'demand';
  let line = demand ? t('heatmap.cardDemandHint') : t('heatmap.cardAvailabilityHint');
  let detail = null;
  if (summary && demand) {
    line = t('heatmap.cardDemand', { jobs: summary.jobs, unfilled: summary.unfilled });
    if (summary.busiestFromHour != null) detail = t('heatmap.busiest', { hours: formatHourRange(summary.busiestFromHour) });
  } else if (summary) {
    line = t('heatmap.workersOnline', { count: summary.workersOnline });
    if (summary.typicalWaitMins != null) detail = t('heatmap.typicalWait', { mins: summary.typicalWaitMins });
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/heatmap', params: { mode } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.icon}>
        <Ionicons name={demand ? 'flame-outline' : 'people-outline'} size={22} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{demand ? t('heatmap.cardDemandTitle') : t('heatmap.cardAvailabilityTitle')}</Text>
        <Text style={styles.line}>{line}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  line: {
    ...typography.body,
    color: colors.text,
  },
  detail: {
    ...typography.label,
    color: colors.textMuted,
  },
});
