import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getErrorMessage, getFieldErrors } from '../services/api';
import { getPayoutAccount, savePayoutAccount } from '../services/payments';

const EMPTY = { holderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '' };

/**
 * Worker: the bank account their online earnings are paid into. The account
 * number is never shown back — the backend keeps only its last 4 digits.
 */
export default function PayoutAccount() {
  const { t } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState(undefined); // undefined = loading, null = none yet
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPayoutAccount()
      .then((account) => {
        setCurrent(account);
        if (account) setForm((f) => ({ ...f, holderName: account.holderName, ifsc: account.ifsc }));
      })
      .catch(() => setCurrent(null));
  }, []);

  const setField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const account = await savePayoutAccount(form);
      Alert.alert(
        t('payoutAccount.savedTitle'),
        t('payoutAccount.savedBody', { bank: account.bankName ?? account.ifsc, last4: account.accountLast4 })
      );
      router.back();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else Alert.alert(t('payoutAccount.saveFailedTitle'), getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [form, router, t]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('payoutAccount.title')} fallbackHref="/earnings" />

      {current === undefined ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>{t('payoutAccount.intro')}</Text>
            {current ? (
              <Text style={styles.current}>
                {t('payoutAccount.current', { bank: current.bankName ?? current.ifsc, last4: current.accountLast4 })}
              </Text>
            ) : null}

            <TextField
              label={t('payoutAccount.holderName')}
              hint={t('payoutAccount.holderNameHint')}
              value={form.holderName}
              onChangeText={(v) => setField('holderName', v)}
              error={errors.holderName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
            />
            <TextField
              label={t('payoutAccount.accountNumber')}
              value={form.accountNumber}
              onChangeText={(v) => setField('accountNumber', v.replace(/\D/g, ''))}
              error={errors.accountNumber}
              keyboardType="number-pad"
              maxLength={18}
              autoComplete="off"
            />
            <TextField
              label={t('payoutAccount.confirmAccountNumber')}
              value={form.confirmAccountNumber}
              onChangeText={(v) => setField('confirmAccountNumber', v.replace(/\D/g, ''))}
              error={errors.confirmAccountNumber}
              keyboardType="number-pad"
              maxLength={18}
              autoComplete="off"
              contextMenuHidden
            />
            <TextField
              label={t('payoutAccount.ifsc')}
              hint={t('payoutAccount.ifscHint')}
              value={form.ifsc}
              onChangeText={(v) => setField('ifsc', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              error={errors.ifsc}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={11}
            />

            <View style={styles.note}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <Text style={styles.noteText}>{t('payoutAccount.privacy')}</Text>
            </View>
            {current ? (
              <View style={styles.note}>
                <Ionicons name="time-outline" size={16} color={colors.warning} />
                <Text style={[styles.noteText, styles.warning]}>{t('payoutAccount.changeWarning')}</Text>
              </View>
            ) : null}

            <Button label={t('payoutAccount.save')} onPress={save} loading={saving} />
          </ScrollView>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  intro: {
    ...typography.body,
    color: colors.text,
  },
  current: {
    ...typography.body,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  noteText: {
    ...typography.label,
    flex: 1,
    color: colors.textMuted,
  },
  warning: {
    color: colors.warning,
  },
});
