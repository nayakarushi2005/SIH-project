import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import TextField from './TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getErrorMessage, getFieldErrors, retryJob } from '../services/api';
import { formatPrice } from '../utils/job';

const RAISES = [50, 100, 200]; // quick "+₹" buttons

/**
 * For a job nobody accepted: change the price and/or description, then search
 * again. Mount it only while open, so each opening starts from the job as it
 * is. `onDone(job)` gets the updated job; `onClose` dismisses.
 */
export default function RetryJobSheet({ job, onClose, onDone }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(() => String(job.price));
  const [description, setDescription] = useState(job.description);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const edits = {};
      if (Number(price) !== job.price) edits.price = Number(price);
      if (description.trim() !== job.description) edits.description = description;
      onDone(await retryJob(job.id, edits));
    } catch (err) {
      const fields = getFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { form: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              {t('jobCard.editTitle')}
            </Text>
            <Text style={styles.body}>{t('jobCard.editBody')}</Text>

            <TextField
              label={t('jobCard.priceLabel')}
              prefix="₹"
              value={price}
              onChangeText={(v) => {
                setPrice(v.replace(/\D/g, ''));
                setErrors({});
              }}
              error={errors.price}
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={styles.raises}>
              {RAISES.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    setPrice(String((Number(price) || job.price) + n));
                    setErrors({});
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('jobCard.raiseBy', { amount: formatPrice(n) })}
                  style={({ pressed }) => [styles.raise, pressed && styles.raisePressed]}
                >
                  <Text style={styles.raiseText}>+{formatPrice(n)}</Text>
                </Pressable>
              ))}
            </View>

            <TextField
              label={t('jobCard.descriptionLabel')}
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                setErrors({});
              }}
              error={errors.description}
              maxLength={500}
              multiline
            />
            {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={onClose}
              disabled={busy}
              style={styles.action}
            />
            <Button
              label={t('jobCard.searchAgain')}
              onPress={submit}
              loading={busy}
              disabled={!price}
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
  raises: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: -spacing.sm,
  },
  raise: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  raisePressed: {
    opacity: 0.7,
  },
  raiseText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
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
