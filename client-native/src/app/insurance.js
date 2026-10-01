import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import { colors, radius, spacing, typography } from '../constants/theme';
import api, { getErrorMessage } from '../services/api';

const STATUS_STYLES = {
  pending: { badge: { backgroundColor: 'rgba(245, 158, 11, 0.1)' }, text: { color: colors.warning } },
  approved: { badge: { backgroundColor: colors.primarySoft }, text: { color: colors.primary } },
  rejected: { badge: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } },
};

export default function Insurance() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ packages: [], applications: [] });

  useEffect(() => {
    let active = true;
    api
      .get('/worker/insurance')
      .then((res) => active && setData(res.data))
      .catch((err) => active && setError(getErrorMessage(err, t('insurance.loadError'))))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t]);

  const handleApply = (pkgId) => {
    Alert.alert(t('insurance.applyTitle'), t('insurance.applyBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('insurance.proceed'),
        onPress: async () => {
          try {
            await api.post(`/worker/insurance/${pkgId}/apply`);
            router.push('/insurance-success');
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('insurance.applyError')));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title={t('insurance.title')} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title={t('insurance.title')} />
        <View style={styles.centered}>
          <Ionicons name="shield-outline" size={64} color={colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.errorText}>{error}</Text>
          <Button label={t('common.goBack')} variant="secondary" onPress={() => router.back()} style={styles.backBtn} />
        </View>
      </SafeAreaView>
    );
  }

  const { packages, applications } = data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={t('insurance.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerSubtitle}>{t('insurance.intro')}</Text>

        {packages.map((pkg) => {
          const pkgId = pkg._id || pkg.id;
          const app = applications.find((a) => String(a.packageId) === String(pkgId));
          const statusStyle = app ? STATUS_STYLES[app.status] ?? STATUS_STYLES.pending : null;

          return (
            <View key={pkgId} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.providerBadge}>
                  <Text style={styles.providerText}>{pkg.provider}</Text>
                </View>
                {app && (
                  <View style={[styles.statusBadge, statusStyle.badge]}>
                    <Text style={[styles.statusText, statusStyle.text]}>
                      {t(`insurance.status.${app.status}`, { defaultValue: app.status })}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.packageName}>{pkg.name}</Text>

              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('insurance.coverage')}</Text>
                <Text style={styles.detailValue}>{pkg.coverage}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('insurance.premium')}</Text>
                <Text style={styles.detailValue}>{pkg.premium}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('insurance.interest')}</Text>
                <Text style={styles.detailValue}>{pkg.interest}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>{t('insurance.paperwork')}</Text>
                <Text style={[styles.detailValue, styles.detailGood]}>
                  <Ionicons name="checkmark-circle" size={14} /> {pkg.paperwork}
                </Text>
              </View>

              {app ? (
                <View style={styles.appliedMsg}>
                  <Text style={styles.appliedMsgText}>
                    {t(`insurance.statusNote.${app.status}`, { defaultValue: '' })}
                  </Text>
                </View>
              ) : pkg.status === 'paused' ? (
                <Button label={t('insurance.onHold')} variant="secondary" disabled style={styles.applyBtn} />
              ) : (
                <Button label={t('insurance.apply')} onPress={() => handleApply(pkgId)} style={styles.applyBtn} />
              )}
            </View>
          );
        })}
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
    padding: spacing.xl,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  emptyIcon: {
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  backBtn: {
    marginTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  providerBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  providerText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: { ...typography.label, fontWeight: '700' },
  packageName: {
    ...typography.title,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  detailGood: {
    color: colors.primary,
  },
  applyBtn: {
    marginTop: spacing.md,
  },
  appliedMsg: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  appliedMsgText: {
    ...typography.label,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
