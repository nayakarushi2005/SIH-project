import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '../constants/theme';

/**
 * Job categories as grouped, multi-select chips. Once `max` are chosen the
 * rest dim and ignore taps until one is removed.
 */
export default function CategoryPicker({ groups, selected, onChange, max, label, hint, error }) {
  const { t } = useTranslation();
  const full = selected.length >= max;

  const toggle = (slug) => {
    if (selected.includes(slug)) onChange(selected.filter((s) => s !== slug));
    else if (!full) onChange([...selected, slug]);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.count}>{t('onboarding.selectedCount', { count: selected.length })}</Text>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {groups.map((group) => (
        <View key={group.slug} style={styles.group}>
          <Text style={styles.groupTitle}>{group.name}</Text>
          <View style={styles.row}>
            {group.categories.map((c) => {
              const checked = selected.includes(c.slug);
              const disabled = full && !checked;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => toggle(c.slug)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled }}
                  style={({ pressed }) => [
                    styles.chip,
                    checked && styles.chipSelected,
                    disabled && styles.chipDisabled,
                    pressed && styles.chipPressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={c.icon}
                    size={18}
                    color={checked ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.chipText, checked && styles.chipTextSelected]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...typography.label, fontWeight: '600', color: colors.text },
  count: { ...typography.label, fontWeight: '600', color: colors.primary },
  hint: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  error: { ...typography.label, color: colors.danger, marginTop: spacing.xs },
  group: { marginTop: spacing.md },
  groupTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipDisabled: { opacity: 0.4 },
  chipPressed: { opacity: 0.8 },
  chipText: { ...typography.body, color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
});
