import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import OptionGroup from './OptionGroup';
import TextField from './TextField';
import { colors, spacing, typography } from '../constants/theme';
import { WITHDRAW_REASONS } from '../constants/worker';
import { getErrorMessage, getFieldErrors, withdrawJob } from '../services/api';

/**
 * Asks an assigned worker why they're cancelling, then withdraws them from
 * the job. Mount it only while open, so each opening starts blank. `onDone`
 * runs after a successful withdrawal; `onClose` dismisses.
 */
export default function WithdrawSheet({ jobId, onClose, onDone }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await withdrawJob(jobId, { reason, note });
      onDone();
    } catch (err) {
      const fields = getFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { form: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const options = WITHDRAW_REASONS.map((r) => ({ value: r, label: t(`withdrawReasons.${r}`) }));

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              {t('workerJob.withdrawConfirmTitle')}
            </Text>
            <Text style={styles.body}>{t('workerJob.withdrawConfirmBody')}</Text>
            <OptionGroup
              label={t('workerJob.withdrawReasonLabel')}
              options={options}
              value={reason}
              onChange={(v) => {
                setReason(v);
                setErrors({});
              }}
              error={errors.reason}
            />
            {reason ? (
              <TextField
                label={reason === 'other' ? t('workerJob.withdrawNoteLabel') : t('workerJob.withdrawNoteOptional')}
                value={note}
                onChangeText={(v) => {
                  setNote(v);
                  setErrors({});
                }}
                error={errors.note}
                maxLength={200}
                multiline
              />
            ) : null}
            {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label={t('workerJob.keepJob')}
              variant="secondary"
              onPress={onClose}
              disabled={busy}
              style={styles.action}
            />
            <Button
              label={t('workerJob.withdrawAction')}
              variant="danger"
              onPress={submit}
              loading={busy}
              disabled={!reason}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  content: {
    padding: spacing.lg - spacing.xs,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  error: {
    ...typography.label,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
  },
});
