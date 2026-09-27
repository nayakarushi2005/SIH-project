import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { getErrorMessage, getFieldErrors, getJob, submitFeedback } from '../services/api';
import { TRAITS, traitLabel } from '../utils/traits';

function StarRating({ t, value, onChange, error }) {
  return (
    <View style={styles.starsWrapper}>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={t('feedback.ratingA11y')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('feedback.starA11y', { n })}
            accessibilityState={{ selected: value === n }}
          >
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={40}
              color={n <= value ? colors.warning : colors.border}
            />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.ratingLabel, error && styles.ratingError]}>
        {error || (value ? t(`feedback.rating.${value}`) : t('feedback.tapToRate'))}
      </Text>
    </View>
  );
}

/** Client rates the worker who completed their job. Route: /feedback?jobId=… */
export default function Feedback() {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const router = useRouter();
  const { jobId } = useLocalSearchParams();
  const GOOD_OPTIONS = useMemo(
    () => TRAITS.map((tr) => ({ value: tr.id, label: traitLabel(t, tr.id, 'good') })),
    [t]
  );
  const BAD_OPTIONS = useMemo(
    () => TRAITS.map((tr) => ({ value: tr.id, label: traitLabel(t, tr.id, 'bad') })),
    [t]
  );
  const REHIRE_OPTIONS = useMemo(
    () => [
      { value: true, label: t('feedback.yes') },
      { value: false, label: t('feedback.no') },
    ],
    [t]
  );
  const BLOCK_OPTIONS = useMemo(
    () => [{ value: 'block', label: t('feedback.block.block') }],
    [t]
  );
  const [job, setJob] = useState(null);
  const [form, setForm] = useState({ rating: 0, praised: [], criticized: [], rehire: null, block: false, comment: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJob(jobId)
      .then(setJob)
      .catch((err) =>
        Alert.alert(t('feedback.loadFailedTitle'), getErrorMessage(err), [
          { text: t('feedback.ok'), onPress: () => router.back() },
        ])
      );
  }, [jobId, router, t]);

  const setField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  // A trait is either good or bad — picking it on one side clears the other.
  const setTraits = useCallback((side, traits) => {
    const other = side === 'praised' ? 'criticized' : 'praised';
    setForm((f) => ({ ...f, [side]: traits, [other]: f[other].filter((t) => !traits.includes(t)) }));
    setErrors((e) => ({ ...e, praised: undefined, criticized: undefined }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.rating) {
      setErrors({ rating: t('feedback.ratingRequired') });
      return;
    }
    setSaving(true);
    try {
      await submitFeedback(jobId, {
        rating: form.rating,
        praised: form.praised,
        criticized: form.criticized,
        rehire: form.rehire,
        block: form.rehire === false && form.block,
        comment: form.comment,
      });
      Alert.alert(t('feedback.thanksTitle'), t('feedback.thanksBody'));
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else Alert.alert(t('feedback.sendFailedTitle'), getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [form, jobId, router, t]);

  const service = job ? bySlug(job.category) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('feedback.title')} fallbackHref="/bookings" />

      {!job ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.jobSummary}>
              <Text style={styles.jobService}>{service?.name ?? job.category}</Text>
              <Text style={styles.jobDescription} numberOfLines={2}>
                {job.description}
              </Text>
            </View>

            <Text style={styles.question}>{t('feedback.question')}</Text>
            <StarRating t={t} value={form.rating} onChange={(v) => setField('rating', v)} error={errors.rating} />

            <OptionGroup
              label={t('feedback.whatWentWell')}
              options={GOOD_OPTIONS}
              value={form.praised}
              onChange={(v) => setTraits('praised', v)}
              error={errors.praised}
              multiple
            />
            <OptionGroup
              label={t('feedback.couldBeBetter')}
              options={BAD_OPTIONS}
              value={form.criticized}
              onChange={(v) => setTraits('criticized', v)}
              error={errors.criticized}
              multiple
            />
            <OptionGroup
              label={t('feedback.wouldRehire')}
              options={REHIRE_OPTIONS}
              value={form.rehire}
              onChange={(v) => setField('rehire', v)}
              error={errors.rehire}
            />
            {form.rehire === false ? (
              <OptionGroup
                label={t('feedback.blockLabel')}
                options={BLOCK_OPTIONS}
                value={form.block ? ['block'] : []}
                onChange={(v) => setField('block', v.length > 0)}
                hint={t('feedback.blockHint')}
                multiple
              />
            ) : null}
            <TextField
              label={t('feedback.commentLabel')}
              placeholder={t('feedback.commentPlaceholder')}
              value={form.comment}
              onChangeText={(v) => setField('comment', v)}
              error={errors.comment}
              multiline
              maxLength={500}
            />
            <Text style={styles.privacy}>{t('feedback.privacy')}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <Button label={t('feedback.submit')} onPress={handleSubmit} loading={saving} />
          </View>
        </KeyboardAvoidingView>
      )}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
  },
  jobSummary: {
    padding: spacing.sm + 4,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  jobService: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  jobDescription: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
  },
  question: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  starsWrapper: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  stars: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  ratingError: {
    color: colors.danger,
  },
  privacy: {
    ...typography.label,
    color: colors.textMuted,
  },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
