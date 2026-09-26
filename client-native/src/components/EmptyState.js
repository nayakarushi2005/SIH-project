import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';

/**
 * Placeholder for screens or sections with nothing to show yet.
 * `compact` renders an inline bordered row instead of a centred block.
 */
export default function EmptyState({ icon, title, body, compact = false, children }) {
  if (compact) {
    return (
      <View style={styles.compact}>
        <Ionicons name={icon} size={20} color={colors.textMuted} />
        <Text style={styles.compactText}>{body}</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  compactText: {
    ...typography.body,
    flex: 1,
    color: colors.textMuted,
  },
});
