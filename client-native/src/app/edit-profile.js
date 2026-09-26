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

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getErrorMessage, getFieldErrors, updateMe } from '../services/api';
import { getUser, saveUser } from '../services/session';
import { formatDOB, GENDERS, genderLabel, LANGUAGES, maskDOB } from '../utils/profile';

const IDENTITY_FIELDS = ['name', 'dob', 'gender', 'address'];
const CONTACT_FIELDS = ['phone', 'city', 'pincode', 'preferredLanguage'];

function toForm(user) {
  return {
    name: user?.name ?? '',
    dob: user?.dob ?? '',
    gender: user?.gender ?? '',
    address: user?.address ?? '',
    phone: user?.phone ?? '',
    city: user?.city ?? '',
    pincode: user?.pincode ?? '',
    preferredLanguage: user?.preferredLanguage ?? 'en',
  };
}

function ReadOnlyRow({ label, value, last }) {
  return (
    <View style={[styles.readOnlyRow, last && styles.readOnlyRowLast]}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value || 'Not available'}</Text>
    </View>
  );
}

export default function EditProfile() {
  const router = useRouter();
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
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        Alert.alert('Could not save', getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }, [form, router, user, verified]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Edit profile" fallbackHref="/profile" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title="Edit profile" fallbackHref="/profile" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Personal details ───────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Personal details</Text>

          {verified ? (
            <>
              <Text style={styles.note}>
                These details are verified from your Aadhaar and can’t be edited.
              </Text>
              <View style={styles.readOnly}>
                <ReadOnlyRow label="Full name" value={user.name} />
                <ReadOnlyRow label="Date of birth" value={formatDOB(user.dob)} />
                <ReadOnlyRow label="Gender" value={genderLabel(user.gender)} />
                <ReadOnlyRow label="Address" value={user.address} last />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.note}>
                These details are self-declared until you verify with DigiLocker, which will
                replace them with your Aadhaar details.
              </Text>
              <TextField
                label="Full name"
                placeholder="As on your government ID"
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                error={errors.name}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
              <TextField
                label="Date of birth"
                placeholder="DD/MM/YYYY"
                value={form.dob}
                onChangeText={(v) => setField('dob', maskDOB(v))}
                error={errors.dob}
                keyboardType="number-pad"
                maxLength={10}
              />
              <OptionGroup
                label="Gender"
                options={GENDERS}
                value={form.gender}
                onChange={(v) => setField('gender', v)}
                error={errors.gender}
              />
              <TextField
                label="Address"
                placeholder="House no., street, area"
                value={form.address}
                onChangeText={(v) => setField('address', v)}
                error={errors.address}
                multiline
                autoComplete="street-address"
              />
            </>
          )}

          {/* ── Contact ────────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Contact</Text>
          <TextField
            label="Mobile number"
            prefix="+91"
            placeholder="10-digit number"
            value={form.phone}
            onChangeText={(v) => setField('phone', v.replace(/\D/g, '').slice(0, 10))}
            error={errors.phone}
            hint="Workers use this to reach you about a job."
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={10}
          />
          <View style={styles.inline}>
            <TextField
              label="City"
              placeholder="e.g. Jaipur"
              value={form.city}
              onChangeText={(v) => setField('city', v)}
              error={errors.city}
              autoCapitalize="words"
              style={styles.inlineWide}
            />
            <TextField
              label="PIN code"
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

          {/* ── Preferences ────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Preferences</Text>
          <OptionGroup
            label="App language"
            options={LANGUAGES}
            value={form.preferredLanguage}
            onChange={(v) => setField('preferredLanguage', v)}
            error={errors.preferredLanguage}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Save changes" onPress={handleSave} loading={saving} />
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
