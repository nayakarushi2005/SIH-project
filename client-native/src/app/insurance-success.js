import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import { colors, radius, spacing, typography } from '../constants/theme';

export default function InsuranceSuccess() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={colors.primary} />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {t('insurance.success.title')}
        </Text>

        <View style={styles.card}>
          <Text style={styles.description}>{t('insurance.success.body')}</Text>
          <Text style={styles.note}>{t('insurance.success.demoNote')}</Text>
        </View>

        <Button label={t('insurance.success.back')} onPress={() => router.push('/benefits')} style={styles.button} />
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
    padding: spacing.xl,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    width: '100%',
  },
  description: {
    ...typography.body,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  note: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  button: {
    width: '100%',
  },
});
