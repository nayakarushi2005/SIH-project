import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import { spacing } from '../constants/theme';

/**
 * "Payment & receipt" for a client's completed job — opens /payment, where
 * they pay online or see the receipt. Renders nothing for other jobs.
 */
export default function JobPaymentButton({ job, style }) {
  const { t } = useTranslation();
  const router = useRouter();
  if (job.status !== 'COMPLETED' || !job.assignedWorker) return null;
  return (
    <Button
      label={t('payment.openButton')}
      variant="secondary"
      onPress={() => router.push({ pathname: '/payment', params: { jobId: job.id } })}
      style={[styles.button, style]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.xs,
    minHeight: 40,
  },
});
