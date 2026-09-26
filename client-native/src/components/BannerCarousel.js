import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';

import IconTile from './IconTile';
import { radius, spacing, typography } from '../constants/theme';
import { makeStyles } from '../hooks/useTheme';
import { shade } from '../utils/color';

const GAP = spacing.sm + 4;
const AUTO_ADVANCE_MS = 5000;

export default function BannerCarousel({ banners, onPress, inset = spacing.lg - spacing.xs }) {
  const styles = useStyles();
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
      const fg = item.foreground;
      return (
        <Pressable
          onPress={() => onPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.cta}`}
          style={({ pressed }) => [
            styles.card,
            {
              width: cardWidth,
              backgroundColor: item.background,
            },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.cardText}>
            <Text style={[styles.title, { color: fg }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.body, { color: fg }]} numberOfLines={3}>
              {item.body}
            </Text>
            <View style={[styles.cta, { backgroundColor: fg }]}>
              <Text style={[styles.ctaText, { color: item.background }]}>{item.cta}</Text>
            </View>
          </View>
          <IconTile icon={item.icon} color={shade(item.background, 0.22)} size={72} />
        </Pressable>
      );
    },
    [cardWidth, onPress, styles]
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
        contentContainerStyle={{ paddingHorizontal: inset, paddingTop: spacing.xs, paddingBottom: spacing.lg }}
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

const useStyles = makeStyles((colors) => ({
  card: {
    minHeight: 164,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.md + 4,
    boxShadow: colors.shadowCard,
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  ctaText: {
    ...typography.label,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
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
}));
