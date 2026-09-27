import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';
import { canShowMap, describePlace } from '../utils/heatmap';

// Only required where it can run — the native module needs a dev build.
const Maps = canShowMap ? require('react-native-maps') : null;

// Cool to hot. Teal-green (the brand) for a little activity, red for a lot.
const GRADIENT = {
  colors: ['#7BD3A8', '#F2C94C', '#F2994A', '#D93025'],
  startPoints: [0.1, 0.4, 0.7, 1],
  colorMapSize: 256,
};
const CELL_TAP_DEG = 0.006; // a tap this close to a cell centre selects it

function regionFor(center, radiusKm) {
  const latDelta = (radiusKm * 2) / 111;
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: latDelta,
    longitudeDelta: latDelta / Math.cos((center.lat * Math.PI) / 180),
  };
}

/** Without Google Maps: the busiest areas as "1.2 km north-east" rows. */
function AreaList({ center, cells, weight, selected, onSelect, renderCount }) {
  const { t } = useTranslation();
  const top = [...cells].sort((a, b) => weight(b) - weight(a)).slice(0, 8);
  if (top.length === 0) return <Text style={styles.empty}>{t('heatmap.noAreas')}</Text>;
  return (
    <View style={styles.list}>
      {top.map((cell) => {
        const isSelected = selected && selected.lat === cell.lat && selected.lng === cell.lng;
        return (
          <Pressable
            key={`${cell.lat},${cell.lng}`}
            onPress={() => onSelect(cell)}
            style={[styles.row, isSelected && styles.rowSelected]}
            accessibilityRole="button"
          >
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={styles.rowPlace}>{describePlace(center, cell)}</Text>
            <Text style={styles.rowCount}>{renderCount(cell)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A heatmap of grid cells around `center`. `weight(cell)` is how hot a cell
 * is; tapping near a cell calls onSelect(cell). Falls back to a list of the
 * busiest areas where Google Maps isn't available.
 */
export default function HeatmapMap({ center, radiusKm, cells, weight, selected, onSelect, renderCount }) {
  const points = useMemo(
    () =>
      cells
        .filter((c) => weight(c) > 0)
        .map((c) => ({ latitude: c.lat, longitude: c.lng, weight: weight(c) })),
    [cells, weight]
  );

  if (!Maps) {
    return (
      <AreaList
        center={center}
        cells={cells}
        weight={weight}
        selected={selected}
        onSelect={onSelect}
        renderCount={renderCount}
      />
    );
  }

  const { default: MapView, Heatmap, Circle, PROVIDER_GOOGLE } = Maps;

  const onPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    let best = null;
    let bestD = CELL_TAP_DEG;
    for (const c of cells) {
      const d = Math.hypot(c.lat - latitude, c.lng - longitude);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    onSelect(best);
  };

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={regionFor(center, radiusKm)}
      showsUserLocation
      showsMyLocationButton
      toolbarEnabled={false}
      onPress={onPress}
    >
      {/* The native layer doesn't redraw on new points, so remount it per data set. */}
      {points.length > 0 ? (
        <Heatmap
          key={points.map((p) => `${p.latitude},${p.longitude},${p.weight}`).join('|')}
          points={points}
          radius={40}
          opacity={0.75}
          gradient={GRADIENT}
        />
      ) : null}
      {selected ? (
        <Circle
          center={{ latitude: selected.lat, longitude: selected.lng }}
          radius={300}
          strokeColor={colors.text}
          strokeWidth={2}
          fillColor="rgba(0,0,0,0.05)"
        />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  list: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rowPlace: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  rowCount: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  empty: {
    ...typography.body,
    padding: spacing.md,
    textAlign: 'center',
    color: colors.textMuted,
  },
});
