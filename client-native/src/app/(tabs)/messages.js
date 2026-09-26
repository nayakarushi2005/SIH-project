import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';

import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../constants/theme';

export default function Messages() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('messages.title')}</Text>
      </View>
      <EmptyState
        icon="chatbubble-ellipses-outline"
        title={t('messages.emptyTitle')}
        body={t('messages.emptyBody')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg - spacing.xs, paddingVertical: spacing.sm + 4 },
  title: { ...typography.heading, fontSize: 24, fontWeight: '800', color: colors.text },
});
