import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import Button from '../components/Button';
import { colors, radius, spacing, typography } from '../constants/theme';

export default function InsuranceSuccess() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={colors.success} />
        </View>

        <Text style={styles.title}>Insurance Active</Text>
        
        <View style={styles.card}>
          <Text style={styles.description}>
            Your request for insurance has been successfully raised. 
            Because you applied through your verified Federation, your policy has been pre-approved and is now active!
          </Text>
          <Text style={styles.note}>
            (This is a demonstration page substituting for a third-party insurance provider's portal)
          </Text>
        </View>

        <Button 
          label="Return to Benefits" 
          onPress={() => router.push('/benefits')} 
          style={styles.button}
        />
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
    ...typography.h1,
    color: colors.success,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xxl,
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
  }
});
