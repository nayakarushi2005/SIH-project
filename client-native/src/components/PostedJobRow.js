import { Image, Pressable, Text, View } from 'react-native';
import { Briefcase, ChevronRight } from 'lucide-react-native';

import IconTile from './IconTile';
import { spacing, typography } from '../constants/theme';
import { getService } from '../constants/services';
import { makeStyles, useTheme } from '../hooks/useTheme';
import { formatJobDate, formatPrice } from '../utils/jobFormat';

export default function PostedJobRow({ job, onPress, last }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const service = getService(job.serviceId);
  const meta = [service?.label, formatJobDate(job.date)].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}. ${meta}. ${formatPrice(job.price) ?? ''}`}
    >
      {job.image ? (
        <Image source={{ uri: job.image }} style={styles.thumb} />
      ) : (
        <IconTile icon={service?.icon ?? Briefcase} color={service?.color ?? colors.primary} size={52} />
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {job.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.price}>{formatPrice(job.price)}</Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: Math.round(52 * 0.3),
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.button,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    ...typography.label,
    fontSize: 13,
    color: colors.textMuted,
  },
  price: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
}));
