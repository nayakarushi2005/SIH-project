import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../constants/theme';

export default function Bookings() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Bookings</Text>
      </View>
      <EmptyState
        icon="calendar-outline"
        title="No bookings yet"
        body="Jobs you post and the workers you book will appear here."
      >
        <Button
          label="Create a new job"
          onPress={() => router.push('/create-job')}
          style={styles.button}
        />
      </EmptyState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg - spacing.xs, paddingVertical: spacing.sm + 4 },
  title: { ...typography.heading, fontSize: 24, fontWeight: '800', color: colors.text },
  button: { marginTop: spacing.md, alignSelf: 'stretch' },
});
