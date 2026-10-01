import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, spacing, typography } from '../constants/theme';
import { EMERGENCY_NUMBER } from '../services/shield';

const AMBER = '#D97706';
const SOS_SIZE = 104;

/**
 * The shield's bottom bar: record a voice note, the big SOS button, and
 * call the emergency number. SOS and Call both count down 3 seconds first
 * (tap again to cancel); once the SOS is on, its button turns it off.
 */
export default function SosBar({
  bottomInset,
  sosActive,
  sosBusy,
  sosCountdown,
  onSosPress,
  callCountdown,
  onCallPress,
  recording,
  uploading,
  onRecordPress,
}) {
  const { t } = useTranslation();
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!sosActive) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sosActive, pulse]);

  const counting = sosCountdown !== null;
  let sosStyle = styles.sosIdle;
  let sosLabel = t('shield.sos.button');
  let sosHint = null;
  let sosA11y = t('shield.sos.buttonA11y');
  if (sosActive) {
    sosStyle = styles.sosOn;
    sosLabel = t('shield.sos.active');
    sosHint = t('shield.sos.tapToStop');
    sosA11y = t('shield.sos.activeA11y');
  } else if (counting) {
    sosStyle = styles.sosCounting;
    sosLabel = String(sosCountdown);
    sosHint = t('common.cancel');
    sosA11y = t('shield.sos.countdownA11y', { count: sosCountdown });
  }

  const callCounting = callCountdown !== null;

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + spacing.md }]}>
      <Pressable
        onPress={onRecordPress}
        style={({ pressed }) => [styles.side, recording && styles.sideRecording, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t(recording ? 'shield.record.stopA11y' : 'shield.record.startA11y')}
        accessibilityState={{ busy: uploading }}
      >
        {uploading && !recording ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <Ionicons name={recording ? 'stop-circle' : 'mic'} size={26} color={recording ? colors.danger : colors.text} />
        )}
        <Text style={[styles.sideLabel, recording && styles.dangerText]} numberOfLines={1}>
          {t(recording ? 'shield.record.stop' : uploading ? 'shield.record.sending' : 'shield.record.start')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onSosPress}
        disabled={sosBusy}
        style={styles.sosWrap}
        accessibilityRole="button"
        accessibilityLabel={sosA11y}
        accessibilityState={{ busy: sosBusy }}
      >
        <Animated.View style={[styles.sos, sosStyle, { transform: [{ scale: pulse }] }]}>
          {sosBusy ? (
            <ActivityIndicator color={colors.textOnPrimary} size="large" />
          ) : (
            <>
              {!counting && <Ionicons name="alert-circle" size={30} color={colors.textOnPrimary} />}
              <Text style={[styles.sosLabel, counting && styles.sosCount]} numberOfLines={1}>
                {sosLabel}
              </Text>
              {sosHint && <Text style={styles.sosHint}>{sosHint}</Text>}
            </>
          )}
        </Animated.View>
      </Pressable>

      <Pressable
        onPress={onCallPress}
        style={({ pressed }) => [styles.side, callCounting && styles.sideCounting, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={
          callCounting
            ? t('shield.callCountdownA11y', { count: callCountdown, number: EMERGENCY_NUMBER })
            : t('shield.call', { number: EMERGENCY_NUMBER })
        }
      >
        {callCounting ? (
          <Text style={styles.callCount}>{callCountdown}</Text>
        ) : (
          <Ionicons name="call" size={24} color={colors.text} />
        )}
        <Text style={[styles.sideLabel, callCounting && styles.amberText]} numberOfLines={1}>
          {callCounting ? t('common.cancel') : t('shield.call', { number: EMERGENCY_NUMBER })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  side: {
    width: 76,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sideRecording: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  sideCounting: {
    backgroundColor: '#FEF3C7',
    borderColor: AMBER,
  },
  sideLabel: {
    ...typography.label,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
  },
  dangerText: { color: colors.danger },
  amberText: { color: AMBER },
  callCount: { fontSize: 22, fontWeight: '800', color: AMBER },
  pressed: { opacity: 0.8 },
  sosWrap: {
    marginTop: -(SOS_SIZE / 2),
  },
  sos: {
    width: SOS_SIZE,
    height: SOS_SIZE,
    borderRadius: SOS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: colors.background,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  sosIdle: { backgroundColor: '#DC2626' },
  sosOn: { backgroundColor: '#7F1D1D' },
  sosCounting: { backgroundColor: AMBER },
  sosLabel: {
    color: colors.textOnPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sosCount: { fontSize: 36 },
  sosHint: {
    ...typography.label,
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
});
