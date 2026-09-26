import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, spacing, typography } from '../constants/theme';
import { SERVICES } from '../constants/services';
import { useWorkerMode } from '../context/WorkerMode';
import { getErrorMessage, getFieldErrors, isAadhaarRequired } from '../services/api';

const SKILL_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label }));
const RADIUS_OPTIONS = [2, 5, 10, 15, 25].map((km) => ({ value: km, label: `${km} km` }));

function toForm(profile) {
  return {
    skills: profile?.skills ?? [],
    serviceRadiusKm: profile?.serviceRadiusKm ?? 5,
    experienceYears: profile?.experienceYears != null ? String(profile.experienceYears) : '',
    bio: profile?.bio ?? '',
  };
}

/** Register as a worker, or edit an existing worker profile. */
export default function WorkerProfile() {
  const router = useRouter();
  const { profile, saveProfile } = useWorkerMode();
  const isNew = !profile;
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const setField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveProfile(form);
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else if (isAadhaarRequired(err)) {
        Alert.alert('Verify your Aadhaar', getErrorMessage(err), [
          { text: 'Not now', style: 'cancel' },
          { text: 'Verify', onPress: () => router.replace('/aadhaar-verify') },
        ]);
      } else {
        Alert.alert('Could not save', getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }, [form, router, saveProfile]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={isNew ? 'Become a worker' : 'Work profile'} fallbackHref="/worker" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isNew ? (
            <Text style={styles.intro}>
              Tell us what you do. We’ll send you job requests nearby that match your skills.
            </Text>
          ) : null}

          <OptionGroup
            label="Services you offer"
            options={SKILL_OPTIONS}
            value={form.skills}
            onChange={(v) => setField('skills', v)}
            error={errors.skills}
            hint="Choose up to 5."
            multiple
          />
          <OptionGroup
            label="How far will you travel?"
            options={RADIUS_OPTIONS}
            value={form.serviceRadiusKm}
            onChange={(v) => setField('serviceRadiusKm', v)}
            error={errors.serviceRadiusKm}
          />
          <TextField
            label="Years of experience (optional)"
            placeholder="e.g. 5"
            value={form.experienceYears}
            onChangeText={(v) => setField('experienceYears', v.replace(/\D/g, '').slice(0, 2))}
            error={errors.experienceYears}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextField
            label="About you (optional)"
            placeholder="e.g. 10 years fixing home wiring, fans and inverters"
            value={form.bio}
            onChangeText={(v) => setField('bio', v)}
            error={errors.bio}
            hint="Clients see this when you’re assigned to their job."
            multiline
            maxLength={300}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label={isNew ? 'Start working' : 'Save changes'} onPress={handleSave} loading={saving} />
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
  intro: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
