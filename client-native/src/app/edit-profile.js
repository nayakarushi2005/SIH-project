import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { getErrorMessage, getFieldErrors, updateMe } from '../services/api';
import { getUser, saveUser } from '../services/session';
import { formatDOB, genderLabel, genderOptions, maskDOB } from '../utils/profile';

const IDENTITY_FIELDS = ['name', 'dob', 'gender', 'address'];
const CONTACT_FIELDS = ['phone', 'city', 'pincode'];

function toForm(user) {
  return {
    name: user?.name ?? '',
    dob: user?.dob ?? '',
    gender: user?.gender ?? '',
    address: user?.address ?? '',
    phone: user?.phone ?? '',
    city: user?.city ?? '',
    pincode: user?.pincode ?? '',
  };
}

function ReadOnlyRow({ label, value, last }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.readOnlyRow, last && styles.readOnlyRowLast]}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value || t('common.notAvailable')}</Text>
    </View>
  );
}

export default function EditProfile() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setUser: setSharedUser } = useUser();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(toForm(null));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUser().then((cached) => {
      setUser(cached ?? {});
      setForm(toForm(cached));
    });
  }, []);

  const setField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const verified = !!user?.isAadhaarVerified;

  const handleSave = useCallback(async () => {
    const editable = verified ? CONTACT_FIELDS : [...IDENTITY_FIELDS, ...CONTACT_FIELDS];
    const initial = toForm(user);
    const changes = {};
    for (const field of editable) {
      const value = typeof form[field] === 'string' ? form[field].trim() : form[field];
      if (value !== initial[field]) changes[field] = value;
    }

    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMe(changes);
      await saveUser(updated);
      setSharedUser(updated);
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        Alert.alert(t('editProfile.saveFailed'), getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }, [form, router, setSharedUser, t, user, verified]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title={t('editProfile.title')} fallbackHref="/profile" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('editProfile.title')} fallbackHref="/profile" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Personal details ───────────────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('profile.personal')}</Text>

          {verified ? (
            <>
              <Text style={styles.note}>
                {t('editProfile.verifiedNote')}
              </Text>
              <View style={styles.readOnly}>
                <ReadOnlyRow label={t('profile.fullName')} value={user.name} />
                <ReadOnlyRow label={t('profile.dob')} value={formatDOB(user.dob)} />
                <ReadOnlyRow label={t('profile.gender')} value={genderLabel(user.gender)} />
                <ReadOnlyRow label={t('profile.address')} value={user.address} last />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.note}>
                {t('editProfile.selfNote')}
              </Text>
              <TextField
                label={t('profile.fullName')}
                placeholder={t('editProfile.namePlaceholder')}
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                error={errors.name}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
              <TextField
                label={t('profile.dob')}
                placeholder={t('editProfile.dobPlaceholder')}
                value={form.dob}
                onChangeText={(v) => setField('dob', maskDOB(v))}
                error={errors.dob}
                keyboardType="number-pad"
                maxLength={10}
              />
              <OptionGroup
                label={t('profile.gender')}
                options={genderOptions()}
                value={form.gender}
                onChange={(v) => setField('gender', v)}
                error={errors.gender}
              />
              <TextField
                label={t('profile.address')}
                placeholder={t('editProfile.addressPlaceholder')}
                value={form.address}
                onChangeText={(v) => setField('address', v)}
                error={errors.address}
                multiline
                autoComplete="street-address"
              />
            </>
          )}

          {/* ── Contact ────────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('profile.contact')}</Text>
          <TextField
            label={t('profile.mobile')}
            prefix="+91"
            placeholder={t('editProfile.mobilePlaceholder')}
            value={form.phone}
            onChangeText={(v) => setField('phone', v.replace(/\D/g, '').slice(0, 10))}
            error={errors.phone}
            hint={t('editProfile.mobileHint')}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={10}
          />
          <View style={styles.inline}>
            <TextField
              label={t('profile.city')}
              placeholder={t('editProfile.cityPlaceholder')}
              value={form.city}
              onChangeText={(v) => setField('city', v)}
              error={errors.city}
              autoCapitalize="words"
              style={styles.inlineWide}
            />
            <TextField
              label={t('profile.pincode')}
              placeholder="302001"
              value={form.pincode}
              onChangeText={(v) => setField('pincode', v.replace(/\D/g, '').slice(0, 6))}
              error={errors.pincode}
              keyboardType="number-pad"
              autoComplete="postal-code"
              maxLength={6}
              style={styles.inlineNarrow}
            />
          </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  note: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  readOnly: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  readOnlyRowLast: {
    borderBottomWidth: 0,
  },
  readOnlyLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  readOnlyValue: {
    ...typography.body,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '600',
    color: colors.text,
  },
  inline: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  inlineWide: {
    flex: 3,
  },
  inlineNarrow: {
    flex: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
