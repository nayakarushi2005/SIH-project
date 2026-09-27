import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import CategoryPicker from '../components/CategoryPicker';
import FederationList from '../components/FederationList';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { MAX_CATEGORIES } from '../constants/worker';
import { useUser } from '../context/UserContext';
import useAgentConversation from '../hooks/useAgentConversation';
import useCategories from '../hooks/useCategories';
import useVoice from '../hooks/useVoice';
import { sendTurn, startOnboarding } from '../services/ai';
import { getErrorMessage, registerWorker, requestFederation } from '../services/api';

const FIELDS = [
  ['name', 'voice.fieldName'],
  ['income', 'voice.fieldIncome'],
  ['categories', 'voice.fieldWork'],
  ['federation', 'voice.fieldFederation'],
];

/**
 * Voice onboarding: the assistant (Python AI service) says a line, the phone
 * reads it aloud, listens for the answer, and sends the text back. Chips let
 * the worker tap instead of speaking. When the assistant has everything, the
 * worker checks a summary and we register through the normal backend.
 */
export default function WorkerVoice() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, setUser } = useUser();
  const { groups, bySlug } = useCategories(i18n.language);
  const { speak, listen, stop, listening, partial } = useVoice(i18n.language);

  const [picked, setPicked] = useState([]); // category chips toggled locally
  const [fedOptions, setFedOptions] = useState([]); // remembered for the summary
  const [saving, setSaving] = useState(false);

  const toForm = useCallback(
    (filled) => {
      stop();
      router.replace({
        pathname: '/worker-form',
        params: filled ? { prefill: JSON.stringify(filled) } : {},
      });
    },
    [router, stop]
  );

  const contextFor = useCallback(
    (ui) => {
      if (ui?.type === 'categories') return groups.flatMap((g) => g.categories.map((c) => c.name));
      if (ui?.type === 'federations') return ui.options.map((o) => o.name);
      return undefined;
    },
    [groups]
  );

  const onResponse = useCallback((next) => {
    if (next.ui?.type === 'categories') setPicked(next.ui.selected);
    if (next.ui?.type === 'federations') setFedOptions(next.ui.options);
  }, []);

  const onServerError = useCallback(
    (err, filled) => {
      Alert.alert(t('voice.serverDown'), getErrorMessage(err));
      toForm(filled);
    },
    [t, toForm]
  );

  const { res, phase, heard, tap, sync, mic } = useAgentConversation({
    start: startOnboarding,
    sendTurn,
    speak,
    listen,
    stop,
    t,
    contextFor,
    onResponse,
    onServerError,
    toForm,
  });

  const micPress = () => {
    if (phase === 'thinking') return;
    mic();
  };

  const confirm = async () => {
    const filled = res?.filled;
    if (!filled) return;
    setSaving(true);
    try {
      let latest = await registerWorker({
        ...(user?.isAadhaarVerified ? {} : { name: filled.name }),
        incomeBracket: filled.incomeBracket,
        categories: filled.categories,
        onboardedVia: 'voice',
      });
      if (filled.federationId) {
        try {
          latest = await requestFederation(filled.federationId);
        } catch {
          Alert.alert(t('federation.requestFailed'));
        }
      }
      setUser(latest);
      Alert.alert(t('onboarding.done'));
      router.dismissTo('/profile');
    } catch (err) {
      Alert.alert(t('onboarding.failed'), getErrorMessage(err));
      toForm(filled);
    } finally {
      setSaving(false);
    }
  };

  const ui = res?.ui;
  const filled = res?.filled;
  const status =
    phase === 'listening'
      ? t('voice.listening')
      : phase === 'thinking'
        ? t('voice.thinking')
        : phase === 'speaking'
          ? t('voice.speaking')
          : t('voice.tapToSpeak');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('voice.title')} fallbackHref="/worker-onboarding" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {phase === 'loading' ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : (
          <>
            <View style={styles.bubble}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.assistant}>{res?.speak}</Text>
            </View>
            {(listening ? partial : heard) ? (
              <Text style={styles.user}>
                {t('voice.you')}: {listening ? partial : heard}
              </Text>
            ) : null}

            {/* Tap choices for the current question (locked while a turn is in flight) */}
            <View pointerEvents={phase === 'thinking' ? 'none' : 'auto'} style={[styles.chips, phase === 'thinking' && styles.locked]}>
            {phase !== 'summary' && ui?.type === 'yesno' ? (
              <View style={styles.row}>
                <Button label={t('voice.yes')} onPress={() => tap({ yes: true })} style={styles.flex} />
                <Button label={t('voice.no')} variant="secondary" onPress={() => tap({ yes: false })} style={styles.flex} />
              </View>
            ) : null}

            {phase !== 'summary' && ui?.type === 'income' ? (
              <OptionGroup
                label={t('onboarding.incomeLabel')}
                options={ui.options.map((o) => ({ value: o.value, label: t(`income.${o.value}`) }))}
                value={null}
                onChange={(value) => tap({ incomeBracket: value })}
              />
            ) : null}

            {phase !== 'summary' && ui?.type === 'categories' ? (
              <>
                <CategoryPicker
                  label={t('onboarding.categoriesLabel')}
                  groups={groups}
                  selected={picked}
                  onChange={(next) => {
                    setPicked(next);
                    sync({ categories: next, confirm: false });
                  }}
                  max={ui.max ?? MAX_CATEGORIES}
                />
                <Button
                  label={t('voice.done')}
                  onPress={() => tap({ categories: picked, confirm: true })}
                  disabled={picked.length === 0}
                />
              </>
            ) : null}

            {phase !== 'summary' && ui?.type === 'federations' ? (
              <FederationList
                mode="pick"
                federations={ui.options.map((o) => ({ ...o, match: 'pincode', memberCount: 0, myStatus: null }))}
                selectedId={undefined}
                onSelect={(id) => tap({ federationId: id })}
              />
            ) : null}

            {phase !== 'summary' && ui?.type === 'fields' ? (
              <View style={styles.fields}>
                {FIELDS.map(([field, key]) => (
                  <Button key={field} label={t(key)} variant="secondary" onPress={() => tap({ field })} />
                ))}
              </View>
            ) : null}

            </View>

            {ui?.type === 'summary' && filled ? (
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>{t('voice.summaryTitle')}</Text>
                <Row label={t('voice.fieldName')} value={filled.name} />
                <Row
                  label={t('voice.fieldIncome')}
                  value={filled.incomeBracket ? t(`income.${filled.incomeBracket}`) : null}
                />
                <Row
                  label={t('voice.fieldWork')}
                  value={filled.categories.map((s) => bySlug(s)?.name ?? s).join(', ')}
                />
                {fedOptions.length > 0 ? (
                  <Row
                    label={t('voice.fieldFederation')}
                    value={fedOptions.find((f) => f.id === filled.federationId)?.name ?? t('voice.none')}
                  />
                ) : null}
                {phase === 'summary' ? (
                  <Button label={t('voice.confirm')} onPress={confirm} loading={saving} />
                ) : (
                  <View style={styles.row}>
                    <Button label={t('voice.yes')} onPress={() => tap({ yes: true })} style={styles.flex} />
                    <Button label={t('voice.no')} variant="secondary" onPress={() => tap({ yes: false })} style={styles.flex} />
                  </View>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {phase !== 'summary' ? (
          <>
            <Pressable
              onPress={micPress}
              disabled={phase === 'loading' || phase === 'thinking'}
              accessibilityRole="button"
              accessibilityLabel={t('voice.micA11y')}
              style={({ pressed }) => [styles.mic, listening && styles.micActive, pressed && styles.pressed]}
            >
              {phase === 'thinking' ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Ionicons name={listening ? 'mic' : 'mic-outline'} size={34} color={colors.textOnPrimary} />
              )}
            </Pressable>
            <Text style={styles.status}>{status}</Text>
          </>
        ) : null}
        <Button label={t('voice.useForm')} variant="text" onPress={() => toForm(filled)} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg - spacing.xs, gap: spacing.md, paddingBottom: spacing.xl },
  loading: { marginTop: spacing.xl },
  flex: { flex: 1 },
  bubble: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  assistant: { ...typography.body, fontSize: 18, lineHeight: 26, color: colors.text, flex: 1 },
  user: { ...typography.body, color: colors.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: spacing.sm },
  fields: { gap: spacing.sm },
  summary: {
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { ...typography.body, color: colors.textMuted },
  summaryValue: { ...typography.body, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  micActive: { backgroundColor: colors.danger },
  chips: { gap: spacing.md },
  locked: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  status: { ...typography.label, color: colors.textMuted },
});
