import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import ScreenHeader from '../../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useUser } from '../../context/UserContext';
import api from '../../services/api';
function DetailRow({ label, value, last, onPress }) {
  const { t } = useTranslation();
  const content = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, !value && styles.rowValueEmpty]}>
          {value || t('common.notAdded')}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={[styles.row, last && styles.rowLast]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const STATUS_KEYS = {
  verified: 'federation.statusVerified',
  pending: 'federation.statusPending',
  removed: 'federation.statusRemoved',
  left: 'federation.statusLeft',
  rejected: 'federation.statusRejected',
};

export default function BenefitsTab() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useUser();
  const [approvedInsurances, setApprovedInsurances] = useState([]);

  useEffect(() => {
    if (user?.federation?.status === 'verified') {
      api.get('/worker/insurance')
        .then(res => {
          const { packages, applications } = res.data;
          const approved = applications.filter(a => a.status === 'approved');
          const enriched = approved.map(app => {
            const pkg = packages.find((p) => String(p._id ?? p.id) === String(app.packageId));
            return { ...app, packageName: pkg?.name || t('insurance.title') };
          });
          setApprovedInsurances(enriched);
        })
        .catch(err => console.log('Failed to fetch insurance', err));
    }
  }, [user?.federation?.status, t]);

  if (!user?.isWorker) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={t('benefits.title')} showBack={false} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('benefits.workersOnly')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={t('benefits.title')} showBack={false} />
      <ScrollView contentContainerStyle={styles.content}>
        
        <Section title={t('benefits.myFederation')}>
          <DetailRow
            label={t('benefits.federationStatus')}
            value={
              user.federation
                ? `${user.federation.name} · ${t(STATUS_KEYS[user.federation.status] ?? 'federation.statusNone')}`
                : t('federation.statusNone')
            }
            onPress={() => router.push('/federations')}
            last={true}
          />
        </Section>

        <Section title={t('benefits.socialSecurity')}>
          {approvedInsurances.length > 0 ? (
            approvedInsurances.map((ins, index) => (
              <DetailRow
                key={ins._id}
                label={t('benefits.activePolicy')}
                value={ins.packageName}
                last={index === approvedInsurances.length - 1}
              />
            ))
          ) : (
            <DetailRow
              label={t('benefits.activePolicy')}
              value={t('benefits.noPolicy')}
              last={false}
            />
          )}
          <DetailRow
            label={t('benefits.explorePlans')}
            value={t('benefits.explorePlansValue')}
            onPress={() => router.push('/insurance')}
            last={true}
          />
        </Section>
        
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          <Text style={styles.infoText}>
            {t('benefits.info')}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.primary + '10',
    padding: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  infoText: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionBody: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: spacing.xs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '600',
    color: colors.text,
  },
  rowValueEmpty: {
    fontWeight: '400',
    color: colors.textMuted,
  }
});
