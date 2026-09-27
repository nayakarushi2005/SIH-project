import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import CategoryPicker from '../components/CategoryPicker';
import LocationCard from '../components/LocationCard';
import OptionGroup from '../components/OptionGroup';
import PhotoPicker from '../components/PhotoPicker';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import useAgentConversation from '../hooks/useAgentConversation';
import useCategories from '../hooks/useCategories';
import useCurrentLocation from '../hooks/useCurrentLocation';
import useJobPhotos from '../hooks/useJobPhotos';
import useVoice from '../hooks/useVoice';
import { sendJobTurn, startJobPosting } from '../services/ai';
import { createJob, getErrorMessage, getFieldErrors } from '../services/api';
import { MAX_PHOTOS, durationOptions, formatDuration, formatPrice } from '../utils/job';

const FIELDS = [
  ['category', 'voiceJob.fieldCategory'],
  ['description', 'voiceJob.fieldDescription'],
  ['price', 'voiceJob.fieldPrice'],
  ['duration', 'voiceJob.fieldDuration'],
  ['address', 'voiceJob.fieldAddress'],
];

/**
 * Voice job posting: same conversation-loop pattern as worker-voice, talking
 * to the job-posting AI session instead. Once the assistant has everything,
 * the worker adds photos, confirms the location, and posts through the
 * normal backend — same as the manual form.
 */
export default function CreateJobVoice() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { service } = useLocalSearchParams();
  const { groups, bySlug } = useCategories(i18n.language);
  const { speak, listen, stop, listening, partial } = useVoice(i18n.language);
  const location = useCurrentLocation();
  const { photos, addPhotos, removePhoto, retryPhoto, urls } = useJobPhotos();

  const [pickedCategory, setPickedCategory] = useState('');
  const [textValue, setTextValue] = useState('');
  const [addressValue, setAddressValue] = useState('');
  const [errors, setErrors] = useState({});
  const [posting, setPosting] = useState(false);

  const toForm = useCallback(
    (filled) => {
      stop();
      router.replace({
        pathname: '/create-job',
        params: filled ? { prefill: JSON.stringify(filled) } : {},
      });
    },
    [router, stop]
  );

  const start = useCallback(
    () => startJobPosting(typeof service === 'string' && service ? { category: service } : {}),
    [service]
  );

  const contextFor = useCallback(
    (ui) => {
      if (ui?.type !== 'category') return undefined;
      return ui.options ? ui.options.map((o) => o.name) : groups.flatMap((g) => g.categories.map((c) => c.name));
    },
    [groups]
  );

  const onServerError = useCallback(
    (err, filled) => {
      Alert.alert(t('voiceJob.serverDown'), getErrorMessage(err));
      toForm(filled);
    },
    [t, toForm]
  );

  // Clear whatever's typed into a chip/text step once the conversation moves
  // on to a different kind of question.
  const onResponse = useCallback((next) => {
    const type = next.ui?.type;
    if (type !== 'category') setPickedCategory('');
    if (type !== 'text') setTextValue('');
    if (type !== 'skip') setAddressValue('');
  }, []);

  const { res, phase, heard, tap, mic } = useAgentConversation({
    start,
    sendTurn: sendJobTurn,
    speak,
    listen,
    stop,
    t,
    contextFor,
    onResponse,
    onServerError,
    toForm,
  });

  const ui = res?.ui;
  const filled = res?.filled;

  const micPress = () => {
    if (phase === 'thinking') return;
    mic();
  };

  const categoryGroups = ui?.options
    ? groups
        .map((g) => ({ ...g, categories: g.categories.filter((c) => ui.options.some((o) => o.slug === c.slug)) }))
        .filter((g) => g.categories.length > 0)
    : groups;

  const sendText = () => {
    const value = textValue.trim();
    if (!value) return;
    tap({ [ui.field]: ui.field === 'price' ? Number(value) : value });
  };

  const sendAddress = () => {
    const value = addressValue.trim();
    if (!value) return;
    tap({ address: value });
  };

  const handlePost = useCallback(async () => {
    setErrors({});
    setPosting(true);
    try {
      await createJob({
        category: res.filled.category,
        description: res.filled.description,
        photos: urls,
        price: res.filled.price,
        expectedDurationMins: res.filled.expectedDurationMins,
        location: location.coords,
        address: res.filled.address,
        language: res.lang,
        postedVia: 'voice',
      });
      Alert.alert(t('createJob.postedTitle'), t('createJob.postedBody'));
      router.dismissTo('/bookings');
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      const keys = Object.keys(fieldErrors);
      if (keys.length > 0) {
        if (keys.some((k) => k !== 'photos' && k !== 'location')) {
          Alert.alert(t('createJob.failedTitle'), getErrorMessage(err));
          toForm(res.filled);
        } else {
          setErrors(fieldErrors);
        }
      } else {
        Alert.alert(t('createJob.failedTitle'), getErrorMessage(err));
      }
    } finally {
      setPosting(false);
    }
  }, [location.coords, res, router, t, toForm, urls]);

  const status =
    phase === 'listening'
      ? t('voice.listening')
      : phase === 'thinking'
        ? t('voice.thinking')
        : phase === 'speaking'
          ? t('voice.speaking')
          : t('voice.tapToSpeak');

  const canPost = urls.length > 0 && location.status === 'ready';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('voiceJob.title')} fallbackHref="/create-job" />

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

            <View pointerEvents={phase === 'thinking' ? 'none' : 'auto'} style={[styles.chips, phase === 'thinking' && styles.locked]}>
              {ui?.type === 'category' ? (
                <CategoryPicker
                  label={t('voiceJob.fieldCategory')}
                  groups={categoryGroups}
                  selected={pickedCategory ? [pickedCategory] : []}
                  max={2}
                  onChange={(slugs) => {
                    const slug = slugs.find((s) => s !== pickedCategory) ?? '';
                    setPickedCategory(slug);
                    if (slug) tap({ category: slug });
                  }}
                />
              ) : null}

              {ui?.type === 'yesno' || ui?.type === 'description' ? (
                <View style={styles.gap}>
                  {ui.type === 'description' ? (
                    <View style={styles.draftCard}>
                      <Text style={styles.draftText}>{ui.text}</Text>
                      {ui.source === 'transcript' ? (
                        <Text style={styles.draftNote}>{t('voiceJob.draftFromSpeech')}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.row}>
                    <Button label={t('voice.yes')} onPress={() => tap({ yes: true })} style={styles.flex} />
                    <Button
                      label={t('voiceJob.sayAgain')}
                      variant="secondary"
                      onPress={() => tap({ yes: false })}
                      style={styles.flex}
                    />
                  </View>
                </View>
              ) : null}

              {ui?.type === 'text' ? (
                <View style={styles.gap}>
                  <TextField
                    label={t(FIELDS.find(([f]) => f === ui.field)?.[1] ?? 'voiceJob.fieldDescription')}
                    value={textValue}
                    onChangeText={setTextValue}
                    keyboardType={ui.field === 'price' ? 'number-pad' : 'default'}
                    multiline={ui.field === 'description'}
                  />
                  <Button label={t('voiceJob.send')} onPress={sendText} disabled={!textValue.trim()} />
                </View>
              ) : null}

              {ui?.type === 'duration' ? (
                <OptionGroup
                  label={t('voiceJob.fieldDuration')}
                  options={durationOptions(t)}
                  value={null}
                  onChange={(durationMins) => tap({ durationMins })}
                />
              ) : null}

              {ui?.type === 'skip' ? (
                <View style={styles.gap}>
                  {ui.text ? (
                    <View style={styles.row}>
                      <TextField
                        label={t('voiceJob.fieldAddress')}
                        value={addressValue}
                        onChangeText={setAddressValue}
                        style={styles.flex}
                      />
                    </View>
                  ) : null}
                  {ui.text ? (
                    <Button label={t('voiceJob.send')} onPress={sendAddress} disabled={!addressValue.trim()} />
                  ) : null}
                  <Button label={t('voiceJob.skip')} variant="secondary" onPress={() => tap({ skip: true })} />
                </View>
              ) : null}

              {ui?.type === 'fields' ? (
                <View style={styles.fields}>
                  <Text style={styles.summaryTitle}>{t('voiceJob.checkTitle')}</Text>
                  {FIELDS.map(([field, key]) => (
                    <Button key={field} label={t(key)} variant="secondary" onPress={() => tap({ field })} />
                  ))}
                </View>
              ) : null}
            </View>

            {ui?.type === 'summary' && filled ? (
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>{t('voiceJob.checkTitle')}</Text>
                <Row label={t('voiceJob.fieldCategory')} value={bySlug(filled.category)?.name ?? filled.category} />
                <Row label={t('voiceJob.fieldDescription')} value={filled.description} />
                <Row label={t('voiceJob.fieldPrice')} value={filled.price != null ? formatPrice(filled.price) : null} />
                <Row
                  label={t('voiceJob.fieldDuration')}
                  value={filled.expectedDurationMins != null ? formatDuration(filled.expectedDurationMins) : null}
                />
                <Row label={t('voiceJob.fieldAddress')} value={filled.address} />

                {phase === 'summary' ? (
                  <>
                    <PhotoPicker
                      label={t('voiceJob.photosTitle')}
                      photos={photos}
                      max={MAX_PHOTOS}
                      onAdd={addPhotos}
                      onRemove={removePhoto}
                      onRetry={retryPhoto}
                      error={errors.photos}
                      hint={t('voiceJob.photosHint', { max: MAX_PHOTOS })}
                    />
                    <LocationCard t={t} location={location} error={errors.location} />
                    <Button label={t('voiceJob.post')} onPress={handlePost} loading={posting} disabled={!canPost} />
                  </>
                ) : (
                  <View style={styles.row}>
                    <Button label={t('voice.yes')} onPress={() => tap({ yes: true })} style={styles.flex} />
                    <Button
                      label={t('voiceJob.sayAgain')}
                      variant="secondary"
                      onPress={() => tap({ yes: false })}
                      style={styles.flex}
                    />
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
        <Button label={t('voiceJob.useForm')} variant="text" onPress={() => toForm(res?.filled)} />
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
  gap: { gap: spacing.sm },
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
  draftCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  draftText: { ...typography.body, color: colors.text },
  draftNote: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
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
