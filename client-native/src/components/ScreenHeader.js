import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { spacing, typography } from '../constants/theme';
import { makeStyles } from '../hooks/useTheme';

export default function ScreenHeader({
  title,
  actionLabel,
  onAction,
  fallbackHref = '/home',
  showBack = true,
}) {
  const styles = useStyles();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <View style={styles.bar}>
      {showBack ? (
        <Pressable
          onPress={goBack}
          hitSlop={spacing.sm}
          style={styles.side}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={styles.chevron} />
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}

      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>
        {actionLabel ? (
          <Pressable onPress={onAction} hitSlop={spacing.sm} accessibilityRole="button">
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  side: {
    width: 64,
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  chevron: {
    width: 11,
    height: 11,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.text,
    transform: [{ rotate: '45deg' }],
    marginLeft: 4,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
  },
  action: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
}));
