import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import { colors, radius, spacing, typography } from '../constants/theme';

export const STATUS_KEYS = {
  pending: 'federation.statusPending',
  verified: 'federation.statusVerified',
  rejected: 'federation.statusRejected',
  removed: 'federation.statusRemoved',
};

const PILL = {
  pending: { color: colors.warning, backgroundColor: colors.warningSoft },
  verified: { color: colors.primary, backgroundColor: colors.primarySoft },
  rejected: { color: colors.danger, backgroundColor: '#FDECEA' },
  removed: { color: colors.danger, backgroundColor: '#FDECEA' },
};

function StatusPill({ status }) {
  const { t } = useTranslation();
  if (!STATUS_KEYS[status]) return null;
  return <Text style={[styles.pill, PILL[status]]}>{t(STATUS_KEYS[status])}</Text>;
}

function Info({ federation }) {
  const { t } = useTranslation();
  return (
    <View style={styles.info}>
      <View style={styles.titleRow}>
        <Text style={styles.name}>{federation.name}</Text>
        <StatusPill status={federation.myStatus} />
      </View>
      <Text style={styles.meta}>
        {t(federation.match === 'pincode' ? 'federation.matchPincode' : 'federation.matchCity')}
        {'  ·  '}
        {t('federation.members', { count: federation.memberCount })}
      </Text>
    </View>
  );
}

/**
 * Nearby federations.
 * - mode 'pick': radio list plus "Not now" (value null) — used in the form.
 * - mode 'manage': one action per row — join, cancel a pending request, or
 *   leave. Only one federation can be active, so other rows wait.
 */
export default function FederationList({
  federations,
  mode,
  selectedId = null,
  onSelect,
  busyId = null,
  onJoin,
  onCancel,
  onLeave,
}) {
  const { t } = useTranslation();

  if (mode === 'pick') {
    const options = [...federations, { id: null }];
    return (
      <View style={styles.box} accessibilityRole="radiogroup">
        {options.map((f, i) => {
          const checked = f.id === selectedId;
          return (
            <Pressable
              key={f.id ?? 'none'}
              onPress={() => onSelect(f.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              style={({ pressed }) => [styles.row, i === options.length - 1 && styles.rowLast, pressed && styles.pressed]}
            >
              {f.id ? <Info federation={f} /> : <Text style={[styles.name, styles.info]}>{t('federation.notNow')}</Text>}
              <Ionicons
                name={checked ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={checked ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  const activeId = federations.find((f) => f.myStatus === 'pending' || f.myStatus === 'verified')?.id ?? null;
  return (
    <View style={styles.box}>
      {federations.map((f, i) => {
        const isActive = f.id === activeId;
        let action = null;
        if (busyId === f.id) {
          action = <ActivityIndicator color={colors.primary} />;
        } else if (isActive && f.myStatus === 'pending') {
          action = <Button label={t('federation.cancel')} variant="secondary" onPress={() => onCancel(f)} style={styles.action} />;
        } else if (isActive) {
          action = <Button label={t('federation.leave')} variant="danger" onPress={() => onLeave(f)} style={styles.action} />;
        } else {
          action = (
            <Button
              label={t('federation.join')}
              variant="secondary"
              onPress={() => onJoin(f)}
              disabled={!!activeId || !!busyId}
              style={styles.action}
            />
          );
        }
        return (
          <View key={f.id} style={[styles.row, styles.manageRow, i === federations.length - 1 && styles.rowLast]}>
            <Info federation={f} />
            {action}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  manageRow: { flexWrap: 'wrap' },
  rowLast: { borderBottomWidth: 0 },
  pressed: { opacity: 0.6 },
  info: { flex: 1, minWidth: 160 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  name: { ...typography.body, fontWeight: '700', color: colors.text },
  meta: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  pill: {
    ...typography.label,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  action: { minHeight: 40, paddingHorizontal: spacing.md },
});
