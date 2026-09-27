import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import useCategories from '../hooks/useCategories';
import useCurrentLocation from '../hooks/useCurrentLocation';
import useJobPhotos from '../hooks/useJobPhotos';
import { createJob, getErrorMessage, getFieldErrors } from '../services/api';
import { getUser } from '../services/session';
import { DURATIONS, MAX_PHOTOS, durationOptions } from '../utils/job';

export default function CreateJob() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { service: serviceId, prefill: prefillParam } = useLocalSearchParams();
  const { groups } = useCategories(i18n.language);
  const location = useCurrentLocation();
  const { photos, addPhotos: addPhotosRaw, removePhoto, retryPhoto } = useJobPhotos();

  // Answers handed over by the voice assistant, if it switched to the form.
  // Only a plain object is trusted — JSON.parse('null') or a stray array
  // would otherwise crash the field reads below.
  const [prefill] = useState(() => {
    try {
      const parsed = prefillParam ? JSON.parse(prefillParam) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });

  const [form, setForm] = useState({
    category:
      (typeof prefill.category === 'string' && prefill.category) ||
      (typeof serviceId === 'string' ? serviceId : ''), // checked by the server
    description: typeof prefill.description === 'string' ? prefill.description : '',
    price: typeof prefill.price === 'number' ? String(prefill.price) : '',
    // A spoken duration that doesn't match an OptionGroup preset (e.g. 90
    // minutes) has no chip to show as selected, so drop it instead of
    // leaving the picker looking empty — the user just re-picks one.
    expectedDurationMins:
      typeof prefill.expectedDurationMins === 'number' &&
      DURATIONS.some((d) => d.value === prefill.expectedDurationMins)
        ? prefill.expectedDurationMins
        : null,
    address: typeof prefill.address === 'string' ? prefill.address : '',
  });
  const [errors, setErrors] = useState({});
  const [posting, setPosting] = useState(false);
  const [aadhaarVerified, setAadhaarVerified] = useState(true);

  useEffect(() => {
    getUser().then((user) => setAadhaarVerified(!!user?.isAadhaarVerified));
  }, []);

  const clearError = useCallback((field) => {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const setField = useCallback(
    (field, value) => {
      setForm((f) => ({ ...f, [field]: value }));
      clearError(field);
    },
    [clearError]
  );

  const addPhotos = useCallback(
    (assets) => {
      clearError('photos');
      addPhotosRaw(assets);
    },
    [addPhotosRaw, clearError]
  );

  // ── Submit ──────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    // Only what the server can't check for us; everything else comes back
    // as field errors from the API.
    const local = {};
    if (photos.some((p) => p.status === 'uploading')) {
      local.photos = t('createJob.photosUploading');
    } else if (photos.some((p) => p.status === 'error')) {
      local.photos = t('createJob.photosFailed');
    }
    if (location.status !== 'ready') {
      local.location = t('createJob.locationRequired');
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setPosting(true);
    try {
      await createJob({
        category: form.category,
        description: form.description,
        photos: photos.map((p) => p.url),
        price: form.price,
        expectedDurationMins: form.expectedDurationMins,
        location: location.coords,
        address: form.address,
        // Keep the language the assistant actually spoke to the worker in,
        // if this form came from a voice handoff; otherwise the current UI
        // language.
        language: (typeof prefill.language === 'string' && prefill.language) || i18n.language,
        postedVia: 'form',
      });
      Alert.alert(t('createJob.postedTitle'), t('createJob.postedBody'));
      router.navigate('/bookings');
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        Alert.alert(t('createJob.failedTitle'), getErrorMessage(err));
      }
    } finally {
      setPosting(false);
    }
  }, [form, i18n.language, location, photos, prefill.language, router, t]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('createJob.title')} />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!aadhaarVerified ? (
            <Pressable
              onPress={() => router.push('/aadhaar-verify')}
              style={styles.notice}
              accessibilityRole="button"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
              <Text style={styles.noticeText}>
                {t('createJob.aadhaarNotice')}{' '}
                <Text style={styles.noticeLink}>{t('createJob.aadhaarVerifyLink')}</Text>
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/create-job-voice',
                params: form.category ? { service: form.category } : {},
              })
            }
            style={({ pressed }) => [styles.voiceCta, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="mic" size={18} color={colors.primary} />
            <Text style={styles.voiceCtaText}>{t('voiceJob.postByVoice')}</Text>
          </Pressable>

          {/* ── The work ───────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('createJob.sectionWork')}</Text>
          {/* One service per job. CategoryPicker is multi-select, so allow a
              second pick and keep only the newest — tapping another chip
              switches the service instead of needing an un-tap first. */}
          <CategoryPicker
            label={t('createJob.serviceLabel')}
            groups={groups}
            selected={form.category ? [form.category] : []}
            max={2}
            onChange={(slugs) => setField('category', slugs.find((s) => s !== form.category) ?? '')}
            error={errors.category}
          />
          <PhotoPicker
            label={t('createJob.photosLabel')}
            photos={photos}
            max={MAX_PHOTOS}
            onAdd={addPhotos}
            onRemove={removePhoto}
            onRetry={retryPhoto}
            error={errors.photos}
            hint={t('createJob.photosHint', { max: MAX_PHOTOS })}
          />
          <TextField
            label={t('createJob.descriptionLabel')}
            placeholder={t('createJob.descriptionPlaceholder')}
            value={form.description}
            onChangeText={(v) => setField('description', v)}
            error={errors.description}
            multiline
            maxLength={500}
          />

          {/* ── Budget & time ──────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('createJob.sectionBudget')}</Text>
          <TextField
            label={t('createJob.priceLabel')}
            prefix="₹"
            placeholder={t('createJob.pricePlaceholder')}
            value={form.price}
            onChangeText={(v) => setField('price', v.replace(/\D/g, '').slice(0, 6))}
            error={errors.price}
            hint={t('createJob.priceHint')}
            keyboardType="number-pad"
            maxLength={6}
          />
          <OptionGroup
            label={t('createJob.durationLabel')}
            options={durationOptions(t)}
            value={form.expectedDurationMins}
            onChange={(v) => setField('expectedDurationMins', v)}
            error={errors.expectedDurationMins}
          />

          {/* ── Where ──────────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('createJob.sectionWhere')}</Text>
          <LocationCard
            t={t}
            location={location}
            error={location.status === 'ready' ? undefined : errors.location}
          />
          <TextField
            label={t('createJob.addressLabel')}
            placeholder={t('createJob.addressPlaceholder')}
            value={form.address}
            onChangeText={(v) => setField('address', v)}
            error={errors.address}
            hint={t('createJob.addressHint')}
            autoComplete="street-address"
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label={t('createJob.post')} onPress={handlePost} loading={posting} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sectionSpacing: {
    marginTop: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  noticeText: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  noticeLink: {
    fontWeight: '700',
    color: colors.warning,
  },
  voiceCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  voiceCtaText: {
    ...typography.button,
    fontWeight: '600',
    color: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
