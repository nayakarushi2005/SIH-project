import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../constants/theme';

/**
 * variant: 'primary' (filled), 'secondary' (outlined), 'danger' (red outline,
 * for destructive actions) or 'text' (link-style).
 */
export default function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, style }) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER[variant] ?? colors.primary} />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const SPINNER = { primary: colors.textOnPrimary, danger: colors.danger };

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  danger: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.background,
  },
  text: {
    minHeight: 40,
    paddingHorizontal: 0,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.button,
    fontWeight: '600',
  },
  primaryLabel: {
    color: colors.textOnPrimary,
  },
  secondaryLabel: {
    color: colors.text,
  },
  dangerLabel: {
    color: colors.danger,
  },
  textLabel: {
    color: colors.primary,
  },
});
