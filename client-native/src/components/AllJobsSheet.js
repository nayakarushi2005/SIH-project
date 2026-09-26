import { useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';

import BottomSheet from './BottomSheet';
import PostedJobRow from './PostedJobRow';
import { radius, spacing, typography } from '../constants/theme';
import { getService } from '../constants/services';
import { makeStyles } from '../hooks/useTheme';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'category', label: 'Category' },
];

function sortKey(job) {
  return job.postedAt ?? 0;
}

function buildSections(jobs, sort) {
  const byNewest = [...jobs].sort((a, b) => sortKey(b) - sortKey(a));
  if (sort === 'oldest') return [{ title: null, data: byNewest.reverse() }];
  if (sort === 'newest') return [{ title: null, data: byNewest }];
  const groups = new Map();
  byNewest.forEach((job) => {
    const label = getService(job.serviceId)?.label ?? 'Other';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(job);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

export default function AllJobsSheet({ visible, jobs, onClose, onSelect }) {
  const styles = useStyles();
  const [sort, setSort] = useState('newest');
  const sections = useMemo(() => buildSections(jobs, sort), [jobs, sort]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          All posted jobs
        </Text>
        <Text style={styles.count}>{jobs.length}</Text>
      </View>

      <View style={styles.sorts} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
        <Text style={styles.sortLabel}>Sort by</Text>
        {SORTS.map((option) => {
          const selected = option.value === sort;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSort(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(job) => job.id}
        renderItem={({ item, index, section }) => (
          <PostedJobRow job={item} onPress={() => onSelect(item)} last={index === section.data.length - 1} />
        )}
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
        }
        stickySectionHeadersEnabled={false}
        style={styles.list}
      />
    </BottomSheet>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm,
  },
  title: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  count: {
    ...typography.label,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  sorts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingBottom: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginRight: 2,
  },
  chip: {
    paddingHorizontal: spacing.sm + 6,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.textOnPrimary,
  },
  list: {
    flexGrow: 0,
  },
  sectionHeader: {
    ...typography.label,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
}));
