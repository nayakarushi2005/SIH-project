import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { getUser } from '../services/session';

// Placeholder until the job model is designed — keeps the navigation and the
// selected service wired up so the real form can drop in here.
export default function CreateJob() {
  const { service: serviceId } = useLocalSearchParams();
  const [lang, setLang] = useState('en');
  useEffect(() => {
    getUser().then((u) => u?.preferredLanguage && setLang(u.preferredLanguage));
  }, []);
  const { bySlug } = useCategories(lang);
  const service = serviceId ? bySlug(serviceId) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title="New job" />
      {service ? (
        <View style={styles.selected}>
          <MaterialCommunityIcons name={service.icon} size={22} color={colors.primary} />
          <Text style={styles.selectedText}>{service.name}</Text>
        </View>
      ) : null}
      <EmptyState
        icon="construct-outline"
        title="Job posting is coming next"
        body="You'll describe the work here and we'll match you with verified workers nearby."
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
