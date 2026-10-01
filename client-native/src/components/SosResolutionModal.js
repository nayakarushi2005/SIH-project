import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, spacing, typography } from '../constants/theme';

/**
 * Asked after an SOS is turned off: was it a false alarm? The answer keeps
 * the safety map honest and moves the user's trust score (server-side).
 * onAnswer('false_alarm' | 'real_emergency').
 */
export default function SosResolutionModal({ visible, onAnswer }) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={26} color={colors.danger} />
            <Text style={styles.title} accessibilityRole="header">
              {t('shield.resolution.title')}
            </Text>
          </View>
          <Text style={styles.question}>{t('shield.resolution.question')}</Text>
          <Text style={styles.body}>{t('shield.resolution.body')}</Text>

          <Option
            icon="close-circle"
            color={colors.danger}
            title={t('shield.resolution.falseAlarm')}
            hint={t('shield.resolution.falseAlarmHint')}
            onPress={() => onAnswer('false_alarm')}
            style={styles.falseAlarm}
          />
          <Option
            icon="checkmark-circle"
            color={colors.primary}
            title={t('shield.resolution.real')}
            hint={t('shield.resolution.realHint')}
            onPress={() => onAnswer('real_emergency')}
            style={styles.real}
          />
        </View>
      </View>
    </Modal>
  );
}

function Option({ icon, color, title, hint, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, style, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={24} color={color} />
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color }]}>{title}</Text>
        <Text style={styles.optionHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  title: { ...typography.title, fontWeight: '700', color: colors.text },
  question: { ...typography.body, fontSize: 16, fontWeight: '600', color: colors.text },
  body: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  falseAlarm: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  real: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { flex: 1 },
  optionTitle: { ...typography.body, fontSize: 15, fontWeight: '700' },
  optionHint: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  pressed: { opacity: 0.85 },
});
