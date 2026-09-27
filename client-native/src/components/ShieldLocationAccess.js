import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import { colors, spacing, typography } from '../constants/theme';

/**
 * Explains why the safety shield needs location before asking for it.
 * `blocked` → the user said no for good; only system settings can change it.
 */
export default function ShieldLocationAccess({ busy, blocked, onAllow, onSkip }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Ionicons name="shield-checkmark" size={44} color={colors.danger} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t('shield.access.title')}
      </Text>
      <Text style={styles.body}>{t('shield.access.body')}</Text>

      <View style={styles.note}>
        <Ionicons name="lock-closed" size={18} color={colors.primary} />
        <Text style={styles.noteText}>{t('shield.access.privacy')}</Text>
      </View>

      {blocked ? (
        <Button label={t('shield.access.settings')} onPress={() => Linking.openSettings()} />
      ) : (
        <Button label={t('shield.access.allow')} onPress={onAllow} loading={busy} />
      )}
      <Button label={t('shield.access.notNow')} variant="text" onPress={onSkip} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  icon: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.heading, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    marginVertical: spacing.sm,
  },
  noteText: { ...typography.body, color: colors.text, flex: 1 },
});
