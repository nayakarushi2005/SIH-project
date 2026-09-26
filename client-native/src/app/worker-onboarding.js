import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';

// Flipped on when the voice assistant ships (Phase 6).
const VOICE_ONBOARDING_ENABLED = false;

function Choice({ icon, title, body, badge, disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.card, disabled && styles.cardDisabled, pressed && styles.pressed]}
    >
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

/** Pick how to register as a worker: by voice or with the form. */
export default function WorkerOnboarding() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('onboarding.title')} fallbackHref="/profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('onboarding.intro')}</Text>
        <Choice
          icon="mic"
          title={t('onboarding.voiceTitle')}
          body={t('onboarding.voiceBody')}
          badge={VOICE_ONBOARDING_ENABLED ? null : t('onboarding.comingSoon')}
          disabled={!VOICE_ONBOARDING_ENABLED}
          onPress={() => router.push('/worker-voice')}
        />
        <Choice
          icon="create"
          title={t('onboarding.formTitle')}
          body={t('onboarding.formBody')}
          onPress={() => router.push('/worker-form')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg - spacing.xs, gap: spacing.md },
  intro: { ...typography.body, color: colors.textMuted, marginBottom: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  cardText: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  badge: {
    ...typography.label,
    fontWeight: '600',
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardBody: { ...typography.label, color: colors.textMuted, marginTop: 2 },
});
