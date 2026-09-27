import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../constants/theme';

export default function LocationCard({ t, location, error }) {
  const { status, label, canAskAgain, refresh } = location;
  const openSettings = status === 'denied' && canAskAgain === false;
  const LOCATION_MESSAGES = {
    denied: t('createJob.locationDenied'),
    off: t('createJob.locationOff'),
    error: t('createJob.locationError'),
  };

  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{t('createJob.locationLabel')}</Text>
      <View style={[styles.locationCard, error && styles.locationCardError]}>
        <Ionicons
          name={status === 'ready' ? 'location-sharp' : 'location-outline'}
          size={20}
          color={status === 'ready' ? colors.primary : colors.textMuted}
        />
        <View style={styles.locationBody}>
          {status === 'loading' ? (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.locationMuted}>{t('createJob.locationFinding')}</Text>
            </View>
          ) : status === 'ready' ? (
            <>
              <Text style={styles.locationTitle}>{t('createJob.locationCurrent')}</Text>
              <Text style={styles.locationMuted} numberOfLines={2}>
                {label || t('createJob.locationGps')}
              </Text>
            </>
          ) : (
            <Text style={styles.locationMuted}>{LOCATION_MESSAGES[status]}</Text>
          )}
        </View>
        {status !== 'loading' ? (
          <Pressable
            onPress={openSettings ? () => Linking.openSettings() : refresh}
            hitSlop={spacing.sm}
            accessibilityRole="button"
          >
            <Text style={styles.locationAction}>
              {openSettings
                ? t('createJob.settings')
                : status === 'ready'
                ? t('createJob.refresh')
                : t('createJob.tryAgain')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : (
        <Text style={styles.fieldHint}>{t('createJob.locationHint')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrapper: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  fieldHint: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  fieldError: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 56,
    padding: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  locationCardError: {
    borderColor: colors.danger,
  },
  locationBody: {
    flex: 1,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  locationMuted: {
    ...typography.label,
    color: colors.textMuted,
  },
  locationAction: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
});
