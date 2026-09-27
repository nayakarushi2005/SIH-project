import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { localeTag } from '../i18n/language';
import { getErrorMessage } from '../services/api';
import { confirmCashPayment, getEarnings } from '../services/payments';
import { formatPrice } from '../utils/job';
import { openReceipt } from '../utils/payment';

const TONES = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

/** Where a payment stands, from the worker's side: [i18n key, tone]. */
function paymentStatus(p) {
  if (p.status === 'PENDING') return ['earnings.status.pending', 'warning'];
  if (p.method === 'cash') return ['earnings.status.cash', 'primary'];
  if (p.payout.status === 'SETTLED') {
    return [p.payout.simulated ? 'earnings.status.settledTest' : 'earnings.status.settled', 'primary'];
  }
  if (p.payout.status === 'FAILED') return ['earnings.status.failed', 'danger'];
  return ['earnings.status.onTheWay', 'warning'];
}

const formatDate = (d) => (d ? new Date(d).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' }) : '');

function PaymentRow({ payment, service, onCash, onReceipt, busy }) {
  const { t } = useTranslation();
  const [key, toneName] = paymentStatus(payment);
  const tone = TONES[toneName];
  return (
    <View style={styles.item}>
      <View style={styles.itemTop}>
        <Text style={styles.itemService} numberOfLines={1}>
          {service}
        </Text>
        <Text style={styles.itemAmount}>{formatPrice(payment.amount)}</Text>
      </View>
      <Text style={styles.meta}>
        {formatDate(payment.completedAt)}
        {payment.status === 'PAID' && payment.method === 'online' && payment.platformFee > 0
          ? ` · ${t('earnings.yourShare', { amount: formatPrice(payment.workerAmount) })}`
          : ''}
      </Text>
      <View style={styles.itemBottom}>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{t(key)}</Text>
        </View>
        {payment.status === 'PENDING' ? (
          <Button label={t('earnings.gotCash')} variant="secondary" onPress={onCash} loading={busy} style={styles.small} />
        ) : (
          <Button label={t('earnings.receipt')} variant="text" onPress={onReceipt} style={styles.small} />
        )}
      </View>
    </View>
  );
}

/** Worker: what they've earned, what's on the way, and their bank details. */
export default function Earnings() {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await getEarnings());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

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

  const confirmCash = useCallback(
    (payment) => {
      Alert.alert(
        t('earnings.cashConfirmTitle', { amount: formatPrice(payment.amount) }),
        t('earnings.cashConfirmBody'),
        [
          { text: t('earnings.cancel'), style: 'cancel' },
          {
            text: t('earnings.confirm'),
            onPress: async () => {
              setConfirming(payment.id);
              try {
                await confirmCashPayment(payment.jobId);
                await load();
              } catch (err) {
                Alert.alert(t('earnings.cashFailedTitle'), getErrorMessage(err));
              } finally {
                setConfirming(null);
              }
            },
          },
        ]
      );
    },
    [load, t]
  );

  const header = <ScreenHeader title={t('earnings.title')} fallbackHref="/worker" />;

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        {failed ? (
          <EmptyState icon="cloud-offline-outline" title={t('earnings.loadFailed')}>
            <Button label={t('earnings.retry')} onPress={load} style={styles.stretch} />
          </EmptyState>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const { totals, payoutAccount: account, payments } = data;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {data.payouts?.testMode ? (
          <View style={styles.testBanner}>
            <Ionicons name="flask-outline" size={16} color={colors.warning} />
            <Text style={styles.testBannerText}>{t('earnings.testBanner')}</Text>
          </View>
        ) : null}

        {/* ── Totals ─────────────────────────────────────────────── */}
        <View style={styles.totals}>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{formatPrice(totals.received)}</Text>
            <Text style={styles.meta}>{t('earnings.received')}</Text>
          </View>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{formatPrice(totals.onTheWay)}</Text>
            <Text style={styles.meta}>{t('earnings.onTheWay')}</Text>
          </View>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{formatPrice(totals.awaitingClient)}</Text>
            <Text style={styles.meta}>{t('earnings.awaitingClient')}</Text>
          </View>
        </View>

        {/* ── Bank account ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('earnings.bankTitle')}</Text>
        {account ? (
          <View style={styles.bank}>
            <View style={styles.bankRow}>
              <Ionicons name="business-outline" size={20} color={colors.textMuted} />
              <View style={styles.flex}>
                <Text style={styles.bankName}>
                  {t('earnings.bankLine', { bank: account.bankName ?? account.ifsc, last4: account.accountLast4 })}
                </Text>
                <Text style={styles.meta}>{account.holderName}</Text>
              </View>
              <Button
                label={t('earnings.editBank')}
                variant="text"
                onPress={() => router.push('/payout-account')}
                style={styles.small}
              />
            </View>
            {account.holdPayoutsUntil ? (
              <Text style={styles.hold}>
                {t('earnings.onHold', {
                  date: new Date(account.holdPayoutsUntil).toLocaleString(localeTag(), {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={[styles.bank, styles.bankMissing]}>
            <Text style={styles.bankMissingText}>{t('earnings.noBank')}</Text>
            <Button label={t('earnings.addBank')} onPress={() => router.push('/payout-account')} />
          </View>
        )}

        {/* ── Jobs ───────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('earnings.jobsTitle')}</Text>
        {payments.length === 0 ? (
          <Text style={styles.meta}>{t('earnings.empty')}</Text>
        ) : (
          payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              service={bySlug(p.category)?.name ?? p.category}
              busy={confirming === p.id}
              onCash={() => confirmCash(p)}
              onReceipt={() => openReceipt(p.id, t)}
            />
          ))
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
  stretch: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.sm + 4,
  },
  testBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  testBannerText: {
    ...typography.label,
    flex: 1,
    color: colors.warning,
  },
  totals: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  total: {
    flex: 1,
    gap: 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  totalValue: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
  },
  sectionTitle: {
    ...typography.body,
    marginTop: spacing.sm,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    ...typography.label,
    color: colors.textMuted,
  },
  bank: {
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bankName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  hold: {
    ...typography.label,
    color: colors.warning,
  },
  bankMissing: {
    borderColor: colors.warningSoft,
    backgroundColor: colors.warningSoft,
  },
  bankMissingText: {
    ...typography.body,
    color: colors.warning,
  },
  item: {
    gap: spacing.xs,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemService: {
    ...typography.body,
    flexShrink: 1,
    fontWeight: '700',
    color: colors.text,
  },
  itemAmount: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  badgeText: {
    ...typography.label,
    fontWeight: '600',
  },
  small: {
    minHeight: 36,
  },
});
