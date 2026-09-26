import { Pressable, Text, View } from 'react-native';

import IconTile from './IconTile';
import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';

export default function ServiceTile({ icon: Icon, color: colorProp, outline = false, label, caption, onPress, accessibilityLabel, style }) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.primary;
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.tile, pressed && styles.tilePressed]}>
            {outline ? (
              <Icon size={40} color={color} strokeWidth={1.75} />
            ) : (
              <IconTile icon={Icon} color={color} size={56} />
            )}
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {caption ? (
            <Text style={styles.caption} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    width: '48%',
  },
  tile: {
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    boxShadow: colors.shadowSoft,
  },
  tilePressed: {
    backgroundColor: colors.primaryPressed,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  caption: {
    ...typography.label,
    color: colors.textMuted,
    opacity: 0.8,
    marginLeft: spacing.xs,
  },
}));
