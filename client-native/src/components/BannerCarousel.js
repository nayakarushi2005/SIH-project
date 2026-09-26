import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';

const GAP = spacing.sm + 4;
const AUTO_ADVANCE_MS = 5000;

const TONES = {
  dark: { card: { backgroundColor: colors.primary }, text: colors.textOnPrimary, icon: 'rgba(255,255,255,0.35)' },
  soft: { card: { backgroundColor: colors.primarySoft }, text: colors.text, icon: colors.primary },
  outline: {
    card: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
    text: colors.text,
    icon: colors.primary,
  },
};

/**
 * Full-width swipeable banners with page dots. Advances on its own every few
 * seconds unless the user is dragging. `inset` is the page's side padding so
 * cards line up with the rest of the content.
 */
export default function BannerCarousel({ banners, onPress, inset = spacing.lg - spacing.xs }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - inset * 2;
  const interval = cardWidth + GAP;

  const listRef = useRef(null);
  const indexRef = useRef(0);
  const draggingRef = useRef(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return undefined;
    const id = setInterval(() => {
      if (draggingRef.current) return;
      const next = (indexRef.current + 1) % banners.length;
      listRef.current?.scrollToOffset({ offset: next * interval, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [banners.length, interval]);

  const onScroll = useCallback(
    (e) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / interval);
      if (i !== indexRef.current && i >= 0 && i < banners.length) {
        indexRef.current = i;
        setIndex(i);
      }
    },
    [banners.length, interval]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const tone = TONES[item.tone] ?? TONES.outline;
      return (
        <Pressable
          onPress={() => onPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.cta}`}
          style={({ pressed }) => [styles.card, tone.card, { width: cardWidth }, pressed && styles.pressed]}
        >
          <View style={styles.cardText}>
            <Text style={[styles.title, { color: tone.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.body, { color: tone.text }]} numberOfLines={2}>
              {item.body}
            </Text>
            <View style={[styles.cta, { borderColor: tone.text }]}>
              <Text style={[styles.ctaText, { color: tone.text }]}>{item.cta}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name={item.icon} size={64} color={tone.icon} />
        </Pressable>
      );
    },
    [cardWidth, onPress]
  );

  return (
    <View>
      <FlatList
        ref={listRef}
        data={banners}
        keyExtractor={(b) => b.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: inset }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
        }}
        onMomentumScrollEnd={() => {
          draggingRef.current = false;
        }}
        getItemLayout={(_, i) => ({ length: interval, offset: interval * i, index: i })}
      />
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {banners.map((b, i) => (
          <View key={b.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 148,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md + 4,
  },
  pressed: {
    opacity: 0.9,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.button,
    fontSize: 17,
    fontWeight: '800',
  },
  body: {
    ...typography.label,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.85,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
  },
  ctaText: {
    ...typography.label,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm + 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
});
