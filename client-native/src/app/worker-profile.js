import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import CategoryPicker from '../components/CategoryPicker';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, spacing } from '../constants/theme';
import { useWorkerMode } from '../context/WorkerMode';
import useCategories from '../hooks/useCategories';
import { getErrorMessage, getFieldErrors } from '../services/api';

const MAX_SKILLS = 10; // backend: MAX_CATEGORIES in services/worker.js
const RADIUS_KM = [2, 5, 10, 15, 25];

function toForm(profile) {
  return {
    skills: profile?.skills ?? [],
    serviceRadiusKm: profile?.serviceRadiusKm ?? 5,
    experienceYears: profile?.experienceYears != null ? String(profile.experienceYears) : '',
    bio: profile?.bio ?? '',
  };
}

/**
 * Edit a registered worker's work settings. Registering itself is the
 * onboarding flow (worker-onboarding: form or voice).
 */
export default function WorkerProfile() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { groups } = useCategories(i18n.language);
  const { profile, saveProfile } = useWorkerMode();
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const radiusOptions = useMemo(
    () => RADIUS_KM.map((km) => ({ value: km, label: t('distance.km', { n: km }) })),
    [t]
  );

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
      } else if (err?.response?.data?.code === 'NOT_REGISTERED') {
        router.replace('/worker-onboarding');
      } else {
        Alert.alert(t('workerProfile.saveFailedTitle'), getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }, [form, router, saveProfile, t]);

  // Not a worker yet — registration is the onboarding flow.
  if (profile === null) return <Redirect href="/worker-onboarding" />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('workerProfile.title')} fallbackHref="/worker" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <CategoryPicker
            label={t('workerProfile.servicesLabel')}
            groups={groups}
            selected={form.skills}
            onChange={(v) => setField('skills', v)}
            max={MAX_SKILLS}
            error={errors.skills}
          />
          <OptionGroup
            label={t('workerProfile.radiusLabel')}
            options={radiusOptions}
            value={form.serviceRadiusKm}
            onChange={(v) => setField('serviceRadiusKm', v)}
            error={errors.serviceRadiusKm}
          />
          <TextField
            label={t('workerProfile.experienceLabel')}
            placeholder={t('workerProfile.experiencePlaceholder')}
            value={form.experienceYears}
            onChangeText={(v) => setField('experienceYears', v.replace(/\D/g, '').slice(0, 2))}
            error={errors.experienceYears}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextField
            label={t('workerProfile.bioLabel')}
            placeholder={t('workerProfile.bioPlaceholder')}
            value={form.bio}
            onChangeText={(v) => setField('bio', v)}
            error={errors.bio}
            hint={t('workerProfile.bioHint')}
            multiline
            maxLength={300}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label={t('common.saveChanges')} onPress={handleSave} loading={saving} />
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
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
