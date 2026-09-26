import { Image, ScrollView, Text, View } from 'react-native';
import { Briefcase, CalendarDays, CircleDot, Clock3, Tag } from 'lucide-react-native';

import BottomSheet from './BottomSheet';
import { radius, spacing, typography } from '../constants/theme';
import { getService } from '../constants/services';
import { makeStyles } from '../hooks/useTheme';
import {
  JOB_STATUS_LABELS,
  formatJobDate,
  formatJobSlot,
  formatPostedAt,
  formatPrice,
} from '../utils/jobFormat';

const WHITE = '#FFFFFF';

function InfoRow({ icon: Icon, label, value }) {
  const styles = useStyles();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Icon size={18} color={WHITE} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function JobDetailSheet({ job, onClose }) {
  const styles = useStyles();
  const service = job ? getService(job.serviceId) : null;
  const ServiceIcon = service?.icon ?? Briefcase;

  return (
    <BottomSheet visible={!!job} onClose={onClose} tone="green" maxHeight="88%">
      {job ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {job.image ? (
            <Image source={{ uri: job.image }} style={styles.image} accessibilityLabel="Job photo" />
          ) : (
            <View style={styles.placeholder}>
              <ServiceIcon size={72} color={WHITE} strokeWidth={1.5} />
            </View>
          )}

          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {job.title}
            </Text>
            <Text style={styles.price}>{formatPrice(job.price)}</Text>
          </View>

          <View style={styles.chips}>
            {service ? (
              <View style={styles.chip}>
                <ServiceIcon size={14} color={WHITE} strokeWidth={2.25} />
                <Text style={styles.chipText}>{service.label}</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <CircleDot size={14} color={WHITE} strokeWidth={2.25} />
              <Text style={styles.chipText}>{JOB_STATUS_LABELS[job.status] ?? 'Open'}</Text>
            </View>
          </View>

          <View style={styles.info}>
            <InfoRow
              icon={CalendarDays}
              label="Date"
              value={formatJobDate(job.date, { weekday: 'short', day: 'numeric', month: 'long' })}
            />
            <InfoRow icon={Clock3} label="Time" value={formatJobSlot(job)} />
            <InfoRow icon={Tag} label="Posted on" value={formatPostedAt(job.postedAt)} />
          </View>

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{job.description || 'No description added.'}</Text>
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  placeholder: {
    height: 180,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: WHITE,
  },
  price: {
    ...typography.title,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: WHITE,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  chipText: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
  },
  info: {
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
  },
  infoLabel: {
    ...typography.body,
    flex: 1,
    color: WHITE,
    opacity: 0.85,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '700',
    color: WHITE,
  },
  sectionLabel: {
    ...typography.label,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: WHITE,
    opacity: 0.8,
    marginBottom: -spacing.sm,
  },
  description: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: WHITE,
  },
}));
