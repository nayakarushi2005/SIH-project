import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { localeTag } from '../i18n/language';
import { getErrorMessage } from '../services/api';
import { createPaymentOrder, getJobPayment, verifyPayment } from '../services/payments';
import { formatPrice } from '../utils/job';
import { openReceipt } from '../utils/payment';

// Native module — only in a dev/production build, not Expo Go or the web.
let RazorpayCheckout = null;
try {
  RazorpayCheckout = require('react-native-razorpay').default;
} catch {
  RazorpayCheckout = null;
}

const formatDate = (d) =>
  new Date(d).toLocaleString(localeTag(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Row({ label, value, strong }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

/** Client pays for a completed job, or sees its receipt. Route: /payment?jobId=… */
export default function Payment() {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const router = useRouter();
  const { jobId } = useLocalSearchParams();
  const [payment, setPayment] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayment(await getJobPayment(jobId));
    } catch (err) {
      Alert.alert(t('payment.loadFailedTitle'), getErrorMessage(err), [
        { text: t('payment.ok'), onPress: () => router.back() },
      ]);
    }
  }, [jobId, router, t]);

  // Reload on focus: the worker may have confirmed cash in the meantime.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pay = useCallback(async () => {
    if (!RazorpayCheckout) {
      Alert.alert(t('payment.unavailableTitle'), t('payment.unavailableBody'));
      return;
    }
    setPaying(true);
    try {
      let order;
      try {
        order = await createPaymentOrder(jobId);
      } catch (err) {
        Alert.alert(t('payment.startFailedTitle'), getErrorMessage(err));
        return;
      }

      let result;
      try {
        result = await RazorpayCheckout.open({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: t('payment.merchantName'),
          description: bySlug(payment?.category)?.name ?? payment?.category ?? '',
          prefill: order.prefill,
          theme: { color: colors.primary },
        });
      } catch {
        // Cancelled, or the bank declined — nothing was charged.
        Alert.alert(t('payment.notCompletedTitle'), t('payment.notCompletedBody'));
        load();
        return;
      }

      try {
        setPayment(
          await verifyPayment(jobId, {
            orderId: result.razorpay_order_id,
            paymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          })
        );
      } catch {
        // The money may well have gone through — Razorpay's webhook will
        // still confirm it, so show "confirming" rather than an error.
        Alert.alert(t('payment.confirmingTitle'), t('payment.confirmingBody'));
        load();
      }
    } finally {
      setPaying(false);
    }
  }, [bySlug, jobId, load, payment, t]);

  const header = <ScreenHeader title={t('payment.title')} fallbackHref="/bookings" />;

  if (!payment) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const service = bySlug(payment.category)?.name ?? payment.category;
  const paid = payment.status === 'PAID';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.summary}>
          <Text style={styles.service}>{service}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {payment.description}
          </Text>
          {payment.workerName ? (
            <Text style={styles.meta}>{t('payment.worker', { name: payment.workerName })}</Text>
          ) : null}
        </View>

        {paid ? (
          <>
            <View style={styles.paidBanner}>
              <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={styles.paidTitle}>
                  {t('payment.paid')} · {formatPrice(payment.amount)}
                </Text>
                <Text style={styles.meta}>{t('payment.paidOn', { date: formatDate(payment.paidAt) })}</Text>
              </View>
            </View>
            <View style={styles.card}>
              <Row label={t('payment.receiptNumber')} value={payment.receiptNumber ?? '—'} strong />
              <Row
                label={t('payment.method')}
                value={payment.method === 'cash' ? t('payment.methodCash') : t('payment.methodOnline')}
              />
            </View>
            <Button label={t('payment.viewReceipt')} onPress={() => openReceipt(payment.id, t)} />
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Row label={t('payment.amountDue')} value={formatPrice(payment.amount)} strong />
            </View>
            {payment.lastFailure ? (
              <Text style={styles.failure}>{t('payment.lastFailure', { reason: payment.lastFailure })}</Text>
            ) : null}
            <Button
              label={t('payment.payButton', { amount: formatPrice(payment.amount) })}
              onPress={pay}
              loading={paying}
            />
            <View style={styles.cashHint}>
              <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
              <Text style={styles.cashHintText}>{t('payment.cashHint')}</Text>
            </View>
          </>
        )}
      </ScrollView>
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
  summary: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  service: {
    ...typography.title,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    ...typography.body,
    color: colors.text,
  },
  meta: {
    ...typography.label,
    color: colors.textMuted,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    flexShrink: 1,
    textAlign: 'right',
    color: colors.text,
  },
  rowStrong: {
    ...typography.title,
    fontWeight: '700',
  },
  paidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  paidTitle: {
    ...typography.title,
    fontWeight: '700',
    color: colors.primary,
  },
  failure: {
    ...typography.body,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  cashHint: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  cashHintText: {
    ...typography.body,
    flex: 1,
    color: colors.textMuted,
  },
});
