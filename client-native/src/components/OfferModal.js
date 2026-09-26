import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import Button from './Button';
import { colors, radius, spacing, typography } from '../constants/theme';
import useCategories from '../hooks/useCategories';
import { useWorkerMode } from '../context/WorkerMode';
import { getErrorMessage } from '../services/api';
import {
  formatCountdown,
  formatDistance,
  formatDuration,
  formatPrice,
  thumbnailUrl,
} from '../utils/job';

const URGENT_MS = 2 * 60 * 1000; // countdown turns red in the last 2 minutes

function Fact({ icon, label, value }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

/**
 * Job request popup for workers, shown over any screen while an offer is
 * open. Shows the soonest-expiring offer; the rest wait their turn.
 */
export default function OfferModal() {
  const { i18n } = useTranslation();
  const { bySlug } = useCategories(i18n.language);
  const router = useRouter();
  const { offers, accept, reject, dropOffer } = useWorkerMode();
  const offer = offers[0] ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(null); // 'accept' | 'reject' | null

  useEffect(() => {
    if (!offer) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [offer]);

  const timeLeft = offer ? new Date(offer.expiresAt).getTime() - now : 0;

  // Expired while on screen — it's gone to other workers.
  useEffect(() => {
    if (offer && timeLeft <= 0) dropOffer(offer.jobId);
  }, [dropOffer, offer, timeLeft]);

  const handleAccept = useCallback(async () => {
    setBusy('accept');
    try {
      await accept(offer.jobId);
      router.push('/worker');
    } catch (err) {
      Alert.alert('Job not available', getErrorMessage(err, 'Another worker may have taken it.'));
    } finally {
      setBusy(null);
    }
  }, [accept, offer, router]);

  const handleReject = useCallback(async () => {
    setBusy('reject');
    await reject(offer.jobId);
    setBusy(null);
  }, [offer, reject]);

  if (!offer) return null;

  const service = bySlug(offer.category);
  const urgent = timeLeft < URGENT_MS;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          {/* ── Header ───────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.serviceIcon}>
                <MaterialCommunityIcons name={service?.icon ?? 'tools'} size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.kicker}>
                  New job request{offers.length > 1 ? `  ·  1 of ${offers.length}` : ''}
                </Text>
                <Text style={styles.title} accessibilityRole="header">
                  {service?.name ?? offer.category}
                </Text>
              </View>
            </View>
            <View style={[styles.timer, urgent && styles.timerUrgent]} accessibilityLabel={`Expires in ${formatCountdown(timeLeft)}`}>
              <Ionicons name="time-outline" size={14} color={urgent ? colors.danger : colors.warning} />
              <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
                {formatCountdown(timeLeft)}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* ── Photos ─────────────────────────────────────────── */}
            {offer.photos?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                {offer.photos.map((url, i) => (
                  <Image
                    key={url}
                    source={{ uri: thumbnailUrl(url, 400) }}
                    style={styles.photo}
                    accessibilityLabel={`Photo ${i + 1} of the work`}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* ── Amount / time / distance ───────────────────────── */}
            <View style={styles.facts}>
              <Fact icon="cash-outline" label="Pay" value={formatPrice(offer.price)} />
              <Fact icon="hourglass-outline" label="Time" value={formatDuration(offer.expectedDurationMins)} />
              <Fact icon="navigate-outline" label="Away" value={formatDistance(offer.distanceMeters) ?? '—'} />
            </View>

            <Text style={styles.description}>{offer.description}</Text>

            <View style={styles.client}>
              <Ionicons
                name={offer.clientAadhaarVerified ? 'shield-checkmark' : 'shield-outline'}
                size={16}
                color={offer.clientAadhaarVerified ? colors.primary : colors.textMuted}
              />
              <Text style={styles.clientText}>
                {offer.clientAadhaarVerified ? 'Aadhaar-verified client' : 'Client not verified yet'}
              </Text>
            </View>
            <Text style={styles.note}>You’ll see the exact address after you accept.</Text>
          </ScrollView>

          {/* ── Actions ──────────────────────────────────────────── */}
          <View style={styles.actions}>
            <Button
              label="Reject"
              variant="secondary"
              onPress={handleReject}
              loading={busy === 'reject'}
              disabled={!!busy}
              style={styles.action}
            />
            <Button
              label="Accept"
              onPress={handleAccept}
              loading={busy === 'accept'}
              disabled={!!busy}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const PHOTO = 120;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingBottom: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    flexShrink: 1,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  kicker: {
    ...typography.label,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  timerUrgent: {
    backgroundColor: colors.dangerSoft,
  },
  timerText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: colors.danger,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: spacing.lg - spacing.xs,
    gap: spacing.md,
  },
  photos: {
    gap: spacing.sm,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  factValue: {
    ...typography.button,
    fontWeight: '800',
    color: colors.text,
  },
  factLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  description: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  client: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  clientText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  note: {
    ...typography.label,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
  },
});
