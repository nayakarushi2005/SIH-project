import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';

export default function SelectField({
  label,
  value,
  placeholder,
  icon: Icon,
  iconColor,
  leadingIcon,
  chevron = true,
  onPress,
  error,
  style,
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ''}${value || placeholder}`}
        style={({ pressed }) => [styles.box, error && styles.boxError, pressed && styles.pressed]}
      >
        {Icon ? <Icon size={20} color={iconColor ?? colors.text} strokeWidth={2.25} /> : null}
        {leadingIcon ? <Ionicons name={leadingIcon} size={18} color={colors.textMuted} /> : null}
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        {chevron ? <Ionicons name="chevron-down" size={18} color={colors.text} /> : null}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 4,
    backgroundColor: colors.background,
  },
  boxError: {
    borderColor: colors.danger,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  value: {
    ...typography.body,
    fontSize: 15,
    flex: 1,
    color: colors.text,
  },
  placeholder: {
    color: colors.textMuted,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
}));
