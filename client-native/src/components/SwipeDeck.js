import { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Check, ChevronsLeft, ChevronsRight, Trash2, X } from 'lucide-react-native';

import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';
import { withAlpha } from '../utils/color';

const FLY_DURATION = 280;
const FLICK_VELOCITY = 900;
const SETTLE = { damping: 22, stiffness: 220, overshootClamping: true };

export default function SwipeDeck({ items, renderCard, onSwipe, renderEmpty }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const threshold = width * 0.28;
  const [index, setIndex] = useState(0);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const busy = useSharedValue(false);

  const current = items[index];
  const next = items[index + 1];

  useLayoutEffect(() => {
    x.set(0);
    y.set(0);
    busy.set(false);
  }, [index, x, y, busy]);

  const advance = useCallback(
    (decision) => {
      if (current) onSwipe?.(current, decision);
      setIndex((i) => i + 1);
    },
    [current, onSwipe]
  );

  const flyOut = useCallback(
    (direction, velocityY = 0) => {
      'worklet';
      busy.set(true);
      y.set(withTiming(y.get() + velocityY * 0.12, { duration: FLY_DURATION }));
      x.set(
        withTiming(
          direction * width * 1.4,
          { duration: FLY_DURATION, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) scheduleOnRN(advance, direction > 0 ? 'accept' : 'reject');
          }
        )
      );
    },
    [advance, busy, width, x, y]
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      if (busy.get()) return;
      x.set(e.translationX);
      y.set(e.translationY * 0.4);
    })
    .onEnd((e) => {
      if (busy.get()) return;
      const flingRight = e.translationX > 0 && e.velocityX > FLICK_VELOCITY;
      const flingLeft = e.translationX < 0 && e.velocityX < -FLICK_VELOCITY;
      if (e.translationX > threshold || flingRight) flyOut(1, e.velocityY);
      else if (e.translationX < -threshold || flingLeft) flyOut(-1, e.velocityY);
      else {
        x.set(withSpring(0, SETTLE));
        y.set(withSpring(0, SETTLE));
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${interpolate(x.get(), [-width, 0, width], [-12, 0, 12])}deg` },
    ],
  }));

  const nextStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(Math.abs(x.get()), [0, width], [0.92, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const acceptStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const rejectStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const acceptIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(x.get(), [0, threshold], [0.5, 1], Extrapolation.CLAMP) }],
  }));
  const rejectIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(x.get(), [-threshold, 0], [1, 0.5], Extrapolation.CLAMP) }],
  }));

  if (!current) return renderEmpty?.(() => setIndex(0)) ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.stack}>
        {next ? (
          <Animated.View style={[styles.card, nextStyle]} pointerEvents="none">
            {renderCard(next)}
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View key={current.id} style={[styles.card, topStyle]}>
            {renderCard(current)}
            <Animated.View style={[styles.overlay, styles.acceptOverlay, acceptStyle]} pointerEvents="none">
              <Animated.View style={acceptIconStyle}>
                <Check size={96} color={colors.textOnPrimary} strokeWidth={2.5} />
              </Animated.View>
            </Animated.View>
            <Animated.View style={[styles.overlay, styles.rejectOverlay, rejectStyle]} pointerEvents="none">
              <Animated.View style={rejectIconStyle}>
                <Trash2 size={88} color={colors.textOnPrimary} strokeWidth={2.25} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            if (!busy.get()) flyOut(-1);
          }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Reject ${current.title}`}
          accessibilityHint="You can also swipe the card left"
        >
          <View style={[styles.ring, styles.rejectRing]}>
            <X size={22} color={colors.danger} strokeWidth={2.75} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionLabel, styles.rejectLabel]}>Reject</Text>
            <View style={styles.tip}>
              <ChevronsLeft size={13} color={colors.textMuted} strokeWidth={2.5} />
              <Text style={styles.tipText}>swipe left</Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!busy.get()) flyOut(1);
          }}
          style={({ pressed }) => [styles.action, styles.acceptAction, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${current.title}`}
          accessibilityHint="You can also swipe the card right"
        >
          <View style={[styles.actionText, styles.actionTextEnd]}>
            <Text style={[styles.actionLabel, styles.acceptLabel]}>Accept</Text>
            <View style={styles.tip}>
              <Text style={styles.tipText}>swipe right</Text>
              <ChevronsRight size={13} color={colors.textMuted} strokeWidth={2.5} />
            </View>
          </View>
          <View style={[styles.ring, styles.acceptRing]}>
            <Check size={22} color={colors.primary} strokeWidth={2.75} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
  },
  stack: {
    flex: 1,
  },
  card: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptOverlay: {
    backgroundColor: withAlpha(colors.primary, 0.6),
  },
  rejectOverlay: {
    backgroundColor: withAlpha(colors.danger, 0.6),
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md + 4,
  },
  action: {
    flex: 1,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    boxShadow: colors.shadowCard,
  },
  acceptAction: {
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
  actionPressed: {
    transform: [{ scale: 0.96 }],
  },
  ring: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectRing: {
    borderColor: colors.danger,
  },
  acceptRing: {
    borderColor: colors.primary,
  },
  actionText: {
    flex: 1,
  },
  actionTextEnd: {
    alignItems: 'flex-end',
  },
  actionLabel: {
    ...typography.button,
    fontWeight: '800',
  },
  rejectLabel: {
    color: colors.danger,
  },
  acceptLabel: {
    color: colors.primary,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tipText: {
    ...typography.label,
    color: colors.textMuted,
  },
}));
