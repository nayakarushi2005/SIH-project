import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import CategoryPicker from '../components/CategoryPicker';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { INCOME_BRACKETS, MAX_CATEGORIES } from '../constants/worker';
import { useUser } from '../context/UserContext';
import useCategories from '../hooks/useCategories';
import { getErrorMessage, getFieldErrors, registerWorker } from '../services/api';

/**
 * Manual worker registration: name (locked once Aadhaar-verified), yearly
 * income bracket and the kinds of work they do. Prefilled from a previous
 * registration so re-registering is one tap.
 */
export default function WorkerForm() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, setUser } = useUser();
  const { groups, bySlug, loading: catalogLoading, error: catalogError } = useCategories(i18n.language);

  const verified = !!user?.isAadhaarVerified;
  const [name, setName] = useState(user?.name ?? '');
  const [incomeBracket, setIncomeBracket] = useState(user?.worker?.incomeBracket ?? null);
  const [categories, setCategories] = useState(user?.worker?.categories ?? []);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Once the real catalogue is here, drop prefilled work types that were
  // retired since the last registration (they'd be invisible and rejected).
  const catalogReady = !catalogLoading && !catalogError;
  const chosen = catalogReady ? categories.filter((slug) => bySlug(slug)) : categories;

  const ready = !!incomeBracket && chosen.length > 0 && (verified || name.trim().length > 1);

  const submit = useCallback(async () => {
    setSaving(true);
    setErrors({});
    try {
      const updated = await registerWorker({
        ...(verified ? {} : { name: name.trim() }),
        incomeBracket,
        categories: chosen,
        onboardedVia: 'form',
      });
      setUser(updated);
      Alert.alert(t('onboarding.done'));
      // Back from Profile shouldn't return to the registration screens.
      router.dismissTo('/profile');
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else Alert.alert(t('onboarding.failed'), getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [chosen, incomeBracket, name, router, setUser, t, verified]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('onboarding.title')} fallbackHref="/worker-onboarding" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {verified ? (
            <View style={styles.readOnly}>
              <Text style={styles.readOnlyLabel}>{t('onboarding.nameLabel')}</Text>
              <View style={styles.readOnlyRight}>
                <Text style={styles.readOnlyValue}>{user?.name}</Text>
                <Text style={styles.tag}>{t('onboarding.nameFromAadhaar')}</Text>
              </View>
            </View>
          ) : (
            <TextField
              label={t('onboarding.nameLabel')}
              placeholder={t('editProfile.namePlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
              autoCapitalize="words"
              autoComplete="name"
            />
          )}

          <OptionGroup
            label={t('onboarding.incomeLabel')}
            options={INCOME_BRACKETS.map((value) => ({ value, label: t(`income.${value}`) }))}
            value={incomeBracket}
            onChange={setIncomeBracket}
            error={errors.incomeBracket}
          />

          <CategoryPicker
            label={t('onboarding.categoriesLabel')}
            hint={t('onboarding.categoriesHint', { max: MAX_CATEGORIES })}
            groups={groups}
            selected={chosen}
            onChange={setCategories}
            max={MAX_CATEGORIES}
            error={errors.categories}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label={t('onboarding.submit')} onPress={submit} loading={saving} disabled={!ready} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg - spacing.xs, paddingBottom: spacing.xl },
  readOnly: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  readOnlyLabel: { ...typography.body, color: colors.textMuted },
  readOnlyRight: { alignItems: 'flex-end', flexShrink: 1 },
  readOnlyValue: { ...typography.body, fontWeight: '600', color: colors.text },
  tag: { ...typography.label, color: colors.primary, marginTop: 2 },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
