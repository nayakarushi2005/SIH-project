import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, typography } from '../constants/theme';

/** Labelled text input with optional prefix, hint and error message. */
const TextField = forwardRef(function TextField(
  { label, error, hint, prefix, style, multiline, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          focused && styles.boxFocused,
          error && styles.boxError,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          {...inputProps}
        />
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 4,
    backgroundColor: colors.background,
  },
  boxMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  boxFocused: {
    borderColor: colors.primary,
  },
  boxError: {
    borderColor: colors.danger,
  },
  prefix: {
    ...typography.body,
    fontSize: 15,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
