import { useCallback, useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getService } from '../constants/services';
import { getErrorMessage, getFieldErrors, getJob, submitFeedback } from '../services/api';
import { TRAITS } from '../utils/traits';

const RATING_LABELS = ['', 'Poor', 'Okay', 'Good', 'Very good', 'Excellent'];
const GOOD_OPTIONS = TRAITS.map((t) => ({ value: t.id, label: t.good }));
const BAD_OPTIONS = TRAITS.map((t) => ({ value: t.id, label: t.bad }));
const REHIRE_OPTIONS = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
];
const BLOCK_OPTIONS = [{ value: 'block', label: 'Don’t send me this worker again' }];

function StarRating({ value, onChange, error }) {
  return (
    <View style={styles.starsWrapper}>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
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
        {error || RATING_LABELS[value] || 'Tap to rate'}
      </Text>
    </View>
  );
}

/** Client rates the worker who completed their job. Route: /feedback?jobId=… */
export default function Feedback() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams();
  const [job, setJob] = useState(null);
  const [form, setForm] = useState({ rating: 0, praised: [], criticized: [], rehire: null, block: false, comment: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJob(jobId)
      .then(setJob)
      .catch((err) => Alert.alert('Could not load the job', getErrorMessage(err), [{ text: 'OK', onPress: () => router.back() }]));
  }, [jobId, router]);

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
      setErrors({ rating: 'Choose a star rating first.' });
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
      Alert.alert('Thanks for your feedback', 'It helps us match you with the right workers.');
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else Alert.alert('Could not send feedback', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [form, jobId, router]);

  const service = job ? getService(job.category) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title="Rate your worker" fallbackHref="/bookings" />

      {!job ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.jobSummary}>
              <Text style={styles.jobService}>{service?.label ?? job.category}</Text>
              <Text style={styles.jobDescription} numberOfLines={2}>
                {job.description}
              </Text>
            </View>

            <Text style={styles.question}>How was the work?</Text>
            <StarRating value={form.rating} onChange={(v) => setField('rating', v)} error={errors.rating} />

            <OptionGroup
              label="What went well?"
              options={GOOD_OPTIONS}
              value={form.praised}
              onChange={(v) => setTraits('praised', v)}
              error={errors.praised}
              multiple
            />
            <OptionGroup
              label="What could be better?"
              options={BAD_OPTIONS}
              value={form.criticized}
              onChange={(v) => setTraits('criticized', v)}
              error={errors.criticized}
              multiple
            />
            <OptionGroup
              label="Would you hire them again?"
              options={REHIRE_OPTIONS}
              value={form.rehire}
              onChange={(v) => setField('rehire', v)}
              error={errors.rehire}
            />
            {form.rehire === false ? (
              <OptionGroup
                label="Block"
                options={BLOCK_OPTIONS}
                value={form.block ? ['block'] : []}
                onChange={(v) => setField('block', v.length > 0)}
                hint="They won’t be offered your jobs in future."
                multiple
              />
            ) : null}
            <TextField
              label="Anything else? (optional)"
              placeholder="Tell us more about the work"
              value={form.comment}
              onChangeText={(v) => setField('comment', v)}
              error={errors.comment}
              multiline
              maxLength={500}
            />
            <Text style={styles.privacy}>
              Your rating shapes which workers you’re matched with. Workers see a summary, never your name.
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <Button label="Submit feedback" onPress={handleSubmit} loading={saving} />
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
