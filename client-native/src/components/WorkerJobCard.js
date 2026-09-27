import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import Button from './Button';
import TextField from './TextField';
import WithdrawSheet from './WithdrawSheet';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import {
  completeJob,
  getErrorMessage,
  getFieldErrors,
  getJob,
  startJob,
} from '../services/api';
import { formatCountdown, formatDuration, formatPrice, jobStatus } from '../utils/job';

// While the job is waiting for the worker, check now and then whether the
// client cancelled it (until push notifications land).
const JOB_POLL_MS = 15 * 1000;

function openDirections({ lat, lng }) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

/**
 * The worker's active job: get there, start it with the client's code, then
 * mark it done. `onChanged` runs after anything that ends or changes the job.
 */
export default function WorkerJobCard({ jobId, onChanged }) {
  const { t, i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [busy, setBusy] = useState(null); // 'start' | 'complete'
  const [withdrawing, setWithdrawing] = useState(false); // reason sheet open
  // Too many wrong start codes: withdrawing is the only way out, window or not.
  const [lockedOut, setLockedOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const next = await getJob(jobId);
      setJob(next);
      setError(null);
      // Cancelled by the client (or finished elsewhere) — let the parent refresh.
      if (!['ASSIGNED', 'IN_PROGRESS'].includes(next.status)) onChanged();
    } catch (err) {
      setError(getErrorMessage(err, t('workerJob.loadFailed')));
    }
  }, [jobId, onChanged, t]);

  // Reload whenever the screen comes back into view, e.g. to notice the
  // client cancelled while the worker was elsewhere.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const waiting = job?.status === 'ASSIGNED';
  useEffect(() => {
    if (!waiting) return undefined;
    const poll = setInterval(load, JOB_POLL_MS);
    return () => clearInterval(poll);
  }, [waiting, load]);

  // Ticks the cancellation-window countdown.
  const cancelDeadline = job?.cancelDeadline ? new Date(job.cancelDeadline).getTime() : 0;
  const cancelLeft = cancelDeadline - now;
  useEffect(() => {
    if (cancelDeadline <= Date.now()) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [cancelDeadline]);

  const handleStart = useCallback(async () => {
    setBusy('start');
    try {
      setJob(await startJob(jobId, code));
      setCode('');
      setCodeError(null);
    } catch (err) {
      const message = getFieldErrors(err).code ?? getErrorMessage(err);
      if (err?.response?.status === 429) setLockedOut(true);
      if (err?.response?.status === 400) setCodeError(message);
      else Alert.alert(t('workerJob.startFailedTitle'), message);
    } finally {
      setBusy(null);
    }
  }, [code, jobId, t]);

  const handleComplete = useCallback(() => {
    Alert.alert(t('workerJob.completeConfirmTitle'), t('workerJob.completeConfirmBody'), [
      { text: t('workerJob.notYet'), style: 'cancel' },
      {
        text: t('workerJob.completeAction'),
        onPress: async () => {
          setBusy('complete');
          try {
            await completeJob(jobId);
            Alert.alert(t('workerJob.completedTitle'), t('workerJob.completedBody'));
            onChanged();
          } catch (err) {
            Alert.alert(t('workerJob.completeFailedTitle'), getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }, [jobId, onChanged, t]);

  const handleWithdrawn = useCallback(() => {
    setWithdrawing(false);
    onChanged();
  }, [onChanged]);

  if (!job) {
    return (
      <View style={[styles.card, styles.centered]}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label={t('common.tryAgain')} variant="secondary" onPress={load} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const service = bySlug(job.category);
  const started = job.status === 'IN_PROGRESS';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={service?.icon ?? 'tools'} size={22} color={colors.primary} />
        <Text style={styles.title}>{service?.name ?? job.category}</Text>
        <View style={[styles.badge, started && styles.badgeActive]}>
          <Text style={[styles.badgeText, started && styles.badgeTextActive]}>
            {started ? t(jobStatus(job.status).key) : t('workerJob.headToClient')}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{job.description}</Text>
      <Text style={styles.muted}>
        {formatPrice(job.price)} · {formatDuration(job.expectedDurationMins)}
      </Text>

      <View style={styles.address}>
        <Text style={styles.addressLabel}>{t('workerJob.addressLabel')}</Text>
        <Text style={styles.addressText}>{job.address || t('workerJob.addressFallback')}</Text>
        <Button
          label={t('workerJob.directions')}
          variant="secondary"
          onPress={() => openDirections(job.location)}
          style={styles.directions}
        />
      </View>

      {started ? (
        <Button label={t('workerJob.markCompleted')} onPress={handleComplete} loading={busy === 'complete'} />
      ) : (
        <>
          <TextField
            label={t('workerJob.startCodeLabel')}
            placeholder={t('workerJob.startCodePlaceholder')}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 4));
              setCodeError(null);
            }}
            error={codeError}
            hint={t('workerJob.startCodeHint')}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Button
            label={t('workerJob.startJob')}
            onPress={handleStart}
            loading={busy === 'start'}
            disabled={code.length !== 4 || !!busy}
          />
          {lockedOut || cancelLeft > 0 ? (
            <Button
              label={
                lockedOut
                  ? t('workerJob.withdrawButton')
                  : t('workerJob.withdrawButtonTimed', { time: formatCountdown(cancelLeft) })
              }
              variant="text"
              onPress={() => setWithdrawing(true)}
              disabled={!!busy}
              style={styles.withdraw}
            />
          ) : (
            <Text style={[styles.muted, styles.windowOver]}>{t('workerJob.cancelWindowOver')}</Text>
          )}
        </>
      )}
      {withdrawing ? (
        <WithdrawSheet jobId={jobId} onClose={() => setWithdrawing(false)} onDone={handleWithdrawn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.button,
    flex: 1,
    fontWeight: '800',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  badgeActive: {
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.warning,
  },
  badgeTextActive: {
    color: colors.primary,
  },
  description: {
    ...typography.body,
    fontSize: 15,
    color: colors.text,
  },
  muted: {
    ...typography.body,
    color: colors.textMuted,
  },
  address: {
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  addressLabel: {
    ...typography.label,
    fontWeight: '600',
    color: colors.textMuted,
  },
  addressText: {
    ...typography.body,
    color: colors.text,
    marginTop: 2,
  },
  directions: {
    marginTop: spacing.sm,
  },
  withdraw: {
    alignSelf: 'center',
  },
  windowOver: {
    ...typography.label,
    textAlign: 'center',
  },
});
