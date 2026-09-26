import { Image, StyleSheet, Text, View } from 'react-native';
import { Briefcase, MapPin, Star } from 'lucide-react-native';

import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';
import { getService } from '../constants/services';
import { withAlpha } from '../utils/color';

function Rating({ value }) {
  const styles = useStyles();
  const filled = Math.round(value);
  return (
    <View style={styles.stars} accessibilityLabel={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          color={n <= filled ? '#FACC15' : 'rgba(255, 255, 255, 0.45)'}
          fill={n <= filled ? '#FACC15' : 'transparent'}
        />
      ))}
    </View>
  );
}

export default function JobCard({ job }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const service = getService(job.serviceId);
  const Icon = service?.icon ?? Briefcase;
  const accent = service?.color ?? colors.primary;

  return (
    <View style={styles.card}>
      <View style={styles.photo}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(accent, 0.12) }]} />
        {job.photo ? (
          <Image
            source={typeof job.photo === 'string' ? { uri: job.photo } : job.photo}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Icon size={96} color={accent} strokeWidth={1.5} />
        )}
        <View style={styles.distance}>
          <MapPin size={12} color="#111111" />
          <Text style={styles.distanceText}>
            {job.distanceKm} km · {job.area}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {job.title}
          </Text>
          <Text style={styles.price}>₹{job.price.toLocaleString('en-IN')}</Text>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {job.description}
        </Text>
        <View style={styles.poster}>
          <Text style={styles.posterName} numberOfLines={1}>
            {job.poster.name}
          </Text>
          <Rating value={job.poster.rating} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.sm + 4,
    boxShadow: colors.shadowFloat,
  },
  photo: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  distance: {
    position: 'absolute',
    left: spacing.sm + 2,
    bottom: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  distanceText: {
    ...typography.label,
    fontWeight: '600',
    color: '#111111',
  },
  body: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    ...typography.button,
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  price: {
    ...typography.button,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textOnPrimary,
    opacity: 0.85,
  },
  poster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  posterName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textOnPrimary,
    flexShrink: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
}));
