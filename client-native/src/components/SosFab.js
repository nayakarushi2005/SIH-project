import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '../constants/theme';

const TAB_BAR_HEIGHT = 49; // React Navigation's default, above the bottom inset
const SIZE = 64;

/**
 * The always-there SOS button above the tab bar. It opens the safety shield
 * with the SOS countdown already running (cancellable), so help is one tap
 * away from anywhere in the app.
 */
export default function SosFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/sisterhood', params: { sos: '1' } })}
      style={({ pressed }) => [
        styles.fab,
        { bottom: insets.bottom + TAB_BAR_HEIGHT + spacing.md },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('shield.fab.a11y')}
      hitSlop={spacing.xs}
    >
      <Text style={styles.label}>{t('shield.fab.label')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#DC2626',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  pressed: { transform: [{ scale: 0.95 }] },
  label: {
    color: colors.textOnPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
