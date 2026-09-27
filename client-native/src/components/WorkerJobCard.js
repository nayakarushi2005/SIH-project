import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import Button from './Button';
import TextField from './TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import {
  completeJob,
  getErrorMessage,
  getFieldErrors,
  getJob,
  startJob,
  withdrawJob,
} from '../services/api';
import { formatDuration, formatPrice } from '../utils/job';

function openDirections({ lat, lng }) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

/**
 * The worker's active job: get there, start it with the client's code, then
 * mark it done. `onChanged` runs after anything that ends or changes the job.
 */
export default function WorkerJobCard({ jobId, onChanged }) {
  const { i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [busy, setBusy] = useState(null); // 'start' | 'complete' | 'withdraw'

  const load = useCallback(async () => {
    try {
      const next = await getJob(jobId);
      setJob(next);
      setError(null);
      // Cancelled by the client (or finished elsewhere) — let the parent refresh.
      if (!['ASSIGNED', 'IN_PROGRESS'].includes(next.status)) onChanged();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your job.'));
    }
  }, [jobId, onChanged]);

  // Reload whenever the screen comes back into view, e.g. to notice the
  // client cancelled while the worker was elsewhere.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleStart = useCallback(async () => {
    setBusy('start');
    try {
      setJob(await startJob(jobId, code));
      setCode('');
      setCodeError(null);
    } catch (err) {
      const message = getFieldErrors(err).code ?? getErrorMessage(err);
      if (err?.response?.status === 400) setCodeError(message);
      else Alert.alert('Could not start', message);
    } finally {
      setBusy(null);
    }
  }, [code, jobId]);

  const handleComplete = useCallback(() => {
    Alert.alert('Mark as completed?', 'Only do this once the work is finished.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Completed',
        onPress: async () => {
          setBusy('complete');
          try {
            await completeJob(jobId);
            Alert.alert('Job completed', 'Great work! You’ll get new job requests again.');
            onChanged();
          } catch (err) {
            Alert.alert('Could not complete', getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }, [jobId, onChanged]);

  const handleWithdraw = useCallback(() => {
    Alert.alert(
      'Withdraw from this job?',
      'The client will be matched with another worker. Withdrawing often lowers the jobs you’re offered.',
      [
        { text: 'Keep job', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setBusy('withdraw');
            try {
              await withdrawJob(jobId);
              onChanged();
            } catch (err) {
              Alert.alert('Could not withdraw', getErrorMessage(err));
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }, [jobId, onChanged]);

  if (!job) {
    return (
      <View style={[styles.card, styles.centered]}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={load} />
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
            {started ? 'In progress' : 'Head to client'}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{job.description}</Text>
      <Text style={styles.muted}>
        {formatPrice(job.price)} · {formatDuration(job.expectedDurationMins)}
      </Text>

      <View style={styles.address}>
        <Text style={styles.addressLabel}>Address</Text>
        <Text style={styles.addressText}>{job.address || 'Pinned location — use directions'}</Text>
        <Button
          label="Get directions"
          variant="secondary"
          onPress={() => openDirections(job.location)}
          style={styles.directions}
        />
      </View>

      {started ? (
        <Button label="Mark as completed" onPress={handleComplete} loading={busy === 'complete'} />
      ) : (
        <>
          <TextField
            label="Start code from the client"
            placeholder="4-digit code"
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 4));
              setCodeError(null);
            }}
            error={codeError}
            hint="Ask the client for their code when you arrive."
            keyboardType="number-pad"
            maxLength={4}
          />
          <Button
            label="Start job"
            onPress={handleStart}
            loading={busy === 'start'}
            disabled={code.length !== 4 || !!busy}
          />
          <Button
            label="Can’t make it? Withdraw"
            variant="text"
            onPress={handleWithdraw}
            disabled={!!busy}
            style={styles.withdraw}
          />
        </>
      )}
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
});
