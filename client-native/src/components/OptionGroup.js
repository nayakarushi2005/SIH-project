import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../constants/theme';

/**
 * Row of chips. options: [{ value, label }].
 * Single-select by default; with `multiple`, `value` is an array and each
 * chip toggles.
 */
export default function OptionGroup({ label, options, value, onChange, error, hint, multiple = false }) {
  const isSelected = (v) => (multiple ? (value ?? []).includes(v) : v === value);

  const press = (v) => {
    if (!multiple) return onChange(v);
    const current = value ?? [];
    onChange(current.includes(v) ? current.filter((x) => x !== v) : [...current, v]);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.row}
        accessibilityRole={multiple ? undefined : 'radiogroup'}
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const selected = isSelected(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => press(option.value)}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={multiple ? { checked: selected } : { selected }}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    ...typography.body,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
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
