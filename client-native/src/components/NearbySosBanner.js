import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, spacing, typography } from '../constants/theme';
import { formatDistance } from '../utils/job';

const HIDDEN_Y = -160;

/**
 * Slides in when someone nearby has an SOS on, showing the closest one.
 * Tapping it shows them on the map; dismissing hides it until a new SOS
 * appears.
 */
export default function NearbySosBanner({ alerts, top, onFocus }) {
  const { t } = useTranslation();
  const [slide] = useState(() => new Animated.Value(HIDDEN_Y));
  const [dismissed, setDismissed] = useState(() => new Set());

  const closest = alerts.find((a) => !dismissed.has(String(a.id))) ?? null;
  const visible = !!closest;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 0 : HIDDEN_Y,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [visible, slide]);

  if (!closest && alerts.length === 0 && dismissed.size > 0) {
    // Everyone we dismissed has turned their SOS off: show the next one again.
    setDismissed(new Set());
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { top, transform: [{ translateY: slide }] }]}
    >
      {closest && (
        <Pressable
          onPress={() => onFocus(closest)}
          style={styles.banner}
          accessibilityRole="button"
          accessibilityLabel={t('shield.banner.a11y', { distance: formatDistance(closest.distanceM) })}
        >
          <View style={styles.dotRing}>
            <View style={styles.dot} />
          </View>
          <View style={styles.text}>
            <Text style={styles.kicker}>{t('shield.banner.title')}</Text>
            <Text style={styles.distance}>
              {t('shield.banner.distance', { distance: formatDistance(closest.distanceM) })}
            </Text>
            <Text style={styles.hint}>{t('shield.banner.hint')}</Text>
          </View>
          <Pressable
            onPress={() => setDismissed((prev) => new Set(prev).add(String(closest.id)))}
            hitSlop={spacing.sm}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('shield.banner.dismiss')}
          >
            <Ionicons name="close" size={18} color={colors.textOnPrimary} />
          </Pressable>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#991B1B',
    borderRadius: 16,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  dotRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: colors.textOnPrimary,
  },
  text: { flex: 1 },
  kicker: { ...typography.label, color: '#FECACA', fontWeight: '700', textTransform: 'uppercase' },
  distance: { ...typography.body, fontSize: 16, color: colors.textOnPrimary, fontWeight: '800' },
  hint: { ...typography.label, color: '#FECACA' },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
