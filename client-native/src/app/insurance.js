import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import { colors, radius, spacing, typography } from '../constants/theme';
import api from '../services/api';

export default function Insurance() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ packages: [], applications: [] });

  useEffect(() => {
    fetchInsurance();
  }, []);

  const fetchInsurance = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/worker/insurance');
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError(err.response.data.message || 'You must be a verified member of a federation to access insurance.');
      } else {
        setError('Could not load insurance data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (pkgId) => {
    Alert.alert('Apply for Insurance', 'You will be redirected to the insurance provider to complete the application.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Proceed',
        onPress: async () => {
          try {
            await api.post(`/worker/insurance/${pkgId}/apply`);
            router.push('/insurance-success');
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to apply.');
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Insurance" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Insurance" />
        <View style={styles.centered}>
          <Ionicons name="shield-outline" size={64} color={colors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Go Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  const { packages, applications } = data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Insurance Collaboration" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerSubtitle}>
          Secure your future with zero-paperwork insurance provided through your Federation.
        </Text>

        {packages.map((pkg) => {
          const app = applications.find(a => a.packageId === pkg.id);

          return (
            <View key={pkg.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.providerBadge}>
                  <Text style={styles.providerText}>{pkg.provider}</Text>
                </View>
                {app && (
                  <View style={[
                    styles.statusBadge, 
                    app.status === 'approved' ? styles.statusApproved :
                    app.status === 'rejected' ? styles.statusRejected : styles.statusPending
                  ]}>
                    <Text style={[
                      styles.statusText,
                      app.status === 'approved' ? styles.statusTextApproved :
                      app.status === 'rejected' ? styles.statusTextRejected : styles.statusTextPending
                    ]}>
                      {app.status.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              
              <Text style={styles.packageName}>{pkg.name}</Text>
              
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>Coverage:</Text>
                <Text style={styles.detailValue}>{pkg.coverage}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>Premium:</Text>
                <Text style={styles.detailValue}>{pkg.premium}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>Interest:</Text>
                <Text style={styles.detailValue}>{pkg.interest}</Text>
              </View>
              <View style={styles.detailsRow}>
                <Text style={styles.detailLabel}>Paperwork:</Text>
                <Text style={[styles.detailValue, { color: colors.success }]}>
                  <Ionicons name="checkmark-circle" size={14} /> {pkg.paperwork}
                </Text>
              </View>

              {!app ? (
                <Button 
                  label="Apply Now" 
                  onPress={() => handleApply(pkg.id)}
                  style={styles.applyBtn}
                />
              ) : (
                <View style={styles.appliedMsg}>
                  <Text style={styles.appliedMsgText}>
                    {app.status === 'pending' ? 'Application sent to Federation for verification.' :
                     app.status === 'approved' ? 'Your insurance is active.' :
                     'Application was rejected by Federation.'}
                  </Text>
                </View>
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
    textAlign: 'center'
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
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
  statusPending: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  statusApproved: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  statusRejected: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  
  statusText: { ...typography.label, fontWeight: '700' },
  statusTextPending: { color: colors.warning },
  statusTextApproved: { color: colors.success },
  statusTextRejected: { color: colors.danger },

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
  applyBtn: {
    marginTop: spacing.md,
  },
  appliedMsg: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center'
  },
  appliedMsgText: {
    ...typography.label,
    color: colors.textMuted,
    fontStyle: 'italic'
  }
});
