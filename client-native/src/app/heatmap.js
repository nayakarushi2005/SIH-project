import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import HeatmapMap from '../components/HeatmapMap';
import ScreenHeader from '../components/ScreenHeader';
import { MOST_BOOKED_SLUGS } from '../constants/services';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useWorkerMode } from '../context/WorkerMode';
import useCategories from '../hooks/useCategories';
import { getErrorMessage } from '../services/api';
import { getAvailabilityHeatmap, getDemandHeatmap } from '../services/heatmap';
import { getCurrentCoords } from '../services/location';
import { canShowMap, describePlace, formatHourRange } from '../utils/heatmap';
import { formatPrice } from '../utils/job';

const WINDOWS = ['today', '7d', '30d'];

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Full-screen heatmap. Route: /heatmap?mode=demand|availability&category=…
 *   demand       — worker: where jobs for their skills are posted
 *   availability — client: where workers are online right now
 */
export default function HeatmapScreen() {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const { profile } = useWorkerMode();
  const params = useLocalSearchParams();
  const mode = params.mode === 'demand' ? 'demand' : 'availability';

  const [coords, setCoords] = useState(null);
  const [category, setCategory] = useState(typeof params.category === 'string' ? params.category : null);
  const [timeWindow, setTimeWindow] = useState('7d');
  const [layer, setLayer] = useState('jobs'); // demand only: 'jobs' | 'unfilled'
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"
  const coordsRef = useRef(null); // located once, reused for every filter

  const categories = mode === 'demand' ? (profile?.skills ?? []) : MOST_BOOKED_SLUGS;

  // Fetch whenever a filter changes; state is only set once results arrive.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const here = coordsRef.current ?? (await getCurrentCoords());
        coordsRef.current = here;
        const result =
          mode === 'demand'
            ? await getDemandHeatmap({ ...here, category, window: timeWindow })
            : await getAvailabilityHeatmap({ ...here, category });
        if (!live) return;
        setCoords(here);
        setData(result);
        setError(null);
      } catch (err) {
        if (live) setError(getErrorMessage(err, t('heatmap.loadFailed')));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt, category, mode, t, timeWindow]);

  /** Wraps a filter setter: show the spinner and clear the selected area. */
  const changing = (setter) => (value) => {
    setLoading(true);
    setSelected(null);
    setter(value);
  };
  const retry = () => changing(setAttempt)(attempt + 1);

  const weight = useMemo(
    () => (mode === 'availability' ? (c) => c.workers : layer === 'unfilled' ? (c) => c.unfilled : (c) => c.jobs),
    [layer, mode]
  );
  const renderCount = useCallback(
    (c) =>
      mode === 'availability'
        ? t('heatmap.workersCount', { count: c.workers })
        : layer === 'unfilled'
          ? t('heatmap.unfilledCount', { count: c.unfilled })
          : t('heatmap.jobsCount', { count: c.jobs }),
    [layer, mode, t]
  );

  const title = mode === 'demand' ? t('heatmap.demandTitle') : t('heatmap.availabilityTitle');

  let summary = null;
  if (data && mode === 'demand') {
    const s = data.summary;
    summary = [
      t('heatmap.demandSummary', { jobs: s.jobs, unfilled: s.unfilled }),
      s.busiestFromHour != null ? t('heatmap.busiest', { hours: formatHourRange(s.busiestFromHour) }) : null,
      s.avgPrice != null ? t('heatmap.avgPrice', { price: formatPrice(s.avgPrice) }) : null,
    ].filter(Boolean);
  } else if (data) {
    const s = data.summary;
    summary = [
      t('heatmap.workersOnline', { count: s.workersOnline }),
      s.typicalWaitMins != null ? t('heatmap.typicalWait', { mins: s.typicalWaitMins }) : t('heatmap.waitUnknown'),
    ];
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={title} fallbackHref={mode === 'demand' ? '/worker' : '/home'} />

      {/* ── Filters ──────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          label={mode === 'demand' ? t('heatmap.allMySkills') : t('heatmap.allServices')}
          active={category === null}
          onPress={() => changing(setCategory)(null)}
        />
        {categories.map((slug) => (
          <Chip
            key={slug}
            label={bySlug(slug)?.name ?? slug}
            active={category === slug}
            onPress={() => changing(setCategory)(slug)}
          />
        ))}
      </ScrollView>
      {mode === 'demand' ? (
        <View style={styles.toggles}>
          <View style={styles.segment}>
            {WINDOWS.map((w) => (
              <Chip key={w} label={t(`heatmap.window.${w}`)} active={timeWindow === w} onPress={() => changing(setTimeWindow)(w)} />
            ))}
          </View>
          <View style={styles.segment}>
            <Chip label={t('heatmap.layerAll')} active={layer === 'jobs'} onPress={() => setLayer('jobs')} />
            <Chip label={t('heatmap.layerUnfilled')} active={layer === 'unfilled'} onPress={() => setLayer('unfilled')} />
          </View>
        </View>
      ) : null}

      {/* ── Map ──────────────────────────────────────────────────── */}
      <View style={styles.mapArea}>
        {error && !data ? (
          <EmptyState icon="map-outline" title={t('heatmap.loadFailed')} body={error}>
            <Button label={t('heatmap.retry')} onPress={retry} style={styles.stretch} />
          </EmptyState>
        ) : !data || !coords ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : canShowMap ? (
          <HeatmapMap
            center={coords}
            radiusKm={data.radiusKm}
            cells={data.cells}
            weight={weight}
            selected={selected}
            onSelect={setSelected}
            renderCount={renderCount}
          />
        ) : (
          <ScrollView>
            <Text style={styles.listTitle}>{t('heatmap.busiestAreas')}</Text>
            <HeatmapMap
              center={coords}
              radiusKm={data.radiusKm}
              cells={data.cells}
              weight={weight}
              selected={selected}
              onSelect={setSelected}
              renderCount={renderCount}
            />
          </ScrollView>
        )}
        {loading && data ? (
          <View style={styles.loadingBadge}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
      </View>

      {/* ── Summary / selected area ─────────────────────────────── */}
      {data && coords ? (
        <View style={styles.sheet}>
          {selected ? (
            <>
              <Text style={styles.sheetTitle}>{describePlace(coords, selected)}</Text>
              <Text style={styles.sheetLine}>
                {mode === 'availability'
                  ? t('heatmap.workersCount', { count: selected.workers })
                  : t('heatmap.cellDemand', { jobs: selected.jobs, unfilled: selected.unfilled })}
              </Text>
            </>
          ) : (
            summary.map((line, i) => (
              <Text key={line} style={i === 0 ? styles.sheetTitle : styles.sheetLine}>
                {line}
              </Text>
            ))
          )}
          {canShowMap ? (
            <View style={styles.legend}>
              <Text style={styles.legendText}>{t('heatmap.legendLow')}</Text>
              <View style={styles.legendBar}>
                {['#7BD3A8', '#F2C94C', '#F2994A', '#D93025'].map((c) => (
                  <View key={c} style={[styles.legendStep, { backgroundColor: c }]} />
                ))}
              </View>
              <Text style={styles.legendText}>{t('heatmap.legendHigh')}</Text>
            </View>
          ) : null}
          <Text style={styles.privacy}>
            {mode === 'demand' ? t('heatmap.demandHint') : t('heatmap.availabilityHint')}
          </Text>
        </View>
      ) : null}
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
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.primary,
  },
  toggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mapArea: {
    flex: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  listTitle: {
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    fontWeight: '700',
    color: colors.text,
  },
  loadingBadge: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    padding: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  sheet: {
    gap: spacing.xs,
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  sheetTitle: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
  },
  sheetLine: {
    ...typography.body,
    color: colors.text,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  legendBar: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  legendStep: {
    flex: 1,
  },
  legendText: {
    ...typography.label,
    color: colors.textMuted,
  },
  privacy: {
    ...typography.label,
    color: colors.textMuted,
  },
});
