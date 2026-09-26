import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';

// Placeholder until the job model is designed — keeps the navigation and the
// selected service wired up so the real form can drop in here.
export default function CreateJob() {
  const { t, i18n } = useTranslation();
  const { service: serviceId } = useLocalSearchParams();
  const { bySlug } = useCategories(i18n.language);
  const service = serviceId ? bySlug(serviceId) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('createJob.title')} />
      {service ? (
        <View style={styles.selected}>
          <MaterialCommunityIcons name={service.icon} size={22} color={colors.primary} />
          <Text style={styles.selectedText}>{service.name}</Text>
        </View>
      ) : null}
      <EmptyState
        icon="construct-outline"
        title={t('createJob.comingTitle')}
        body={t('createJob.comingBody')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  selectedText: { ...typography.body, fontWeight: '700', color: colors.primary },
});
