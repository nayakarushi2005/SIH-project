import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Button from '../components/Button';
import NearbySosBanner from '../components/NearbySosBanner';
import ShieldLocationAccess from '../components/ShieldLocationAccess';
import SosBar from '../components/SosBar';
import SosResolutionModal from '../components/SosResolutionModal';
import { colors, spacing, typography } from '../constants/theme';
import useCountdown from '../hooks/useCountdown';
import useShield from '../hooks/useShield';
import useSosTriggers from '../hooks/useSosTriggers';
import useVoiceNote from '../hooks/useVoiceNote';
import { EMERGENCY_NUMBER, callEmergency } from '../services/shield';
import { formatDistance } from '../utils/job';
import { formatScore, scoreColor } from '../utils/safety';

const COUNTDOWN_SECONDS = 3;
const SOS_CLIP_MS = 60 * 1000; // during an SOS, voice notes go out a minute at a time
const MIC_HANDOFF_MS = 300; // time for the speech recogniser to let go of the mic
// Google Maps on Android crashes without an API key (app.config.js); the
// shield still works without the map.
const MAP_AVAILABLE = Platform.OS !== 'android' || !!Constants.expoConfig?.extra?.googleMapsConfigured;
const BAR_HEIGHT = 96;
const HUD_HEIGHT = 64;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sisterhood Shield: while open, the user's position feeds the city safety
 * map, people nearby see their SOS, and they see SOS alerts around them.
 * `?sos=1` (from the SOS button on the tabs) starts the SOS countdown.
 */
export default function SisterhoodScreen() {
  const router = useRouter();
  const { sos } = useLocalSearchParams();
  const [permission, setPermission] = useState('checking'); // checking | granted | denied | blocked
  const [asking, setAsking] = useState(false);

  const fromPermission = (p) => (p.granted ? 'granted' : p.canAskAgain ? 'denied' : 'blocked');

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setPermission(fromPermission(p)))
      .catch(() => setPermission('denied'));
  }, []);

  const allow = useCallback(async () => {
    setAsking(true);
    try {
      setPermission(fromPermission(await Location.requestForegroundPermissionsAsync()));
    } catch {
      setPermission('denied');
    } finally {
      setAsking(false);
    }
  }, []);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [router]);

  let content;
  if (permission === 'checking') {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  } else if (permission === 'granted') {
    content = <Shield autoSos={sos === '1'} onLeave={leave} />;
  } else {
    content = (
      <SafeAreaView style={styles.flex}>
        <ShieldLocationAccess busy={asking} blocked={permission === 'blocked'} onAllow={allow} onSkip={leave} />
      </SafeAreaView>
    );
  }

  return (
    <>
      {/* Closing the shield always goes through the confirm below. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="dark" />
      {content}
    </>
  );
}

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function Shield({ autoSos, onLeave }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const mapRef = useRef(null);
  const lastPosition = useRef(null);
  const [following, setFollowing] = useState(true);
  const [handingOff, setHandingOff] = useState(false);
  const userStoppedRecording = useRef(false);
  const autoSosDone = useRef(false);

  const shield = useShield({ onClosedElsewhere: onLeave });
  const { status, sosActive, phase } = shield;

  const voice = useVoiceNote({
    getLocation: () => lastPosition.current,
    maxDurationMs: sosActive ? SOS_CLIP_MS : null,
  });

  const sosCountdown = useCountdown(COUNTDOWN_SECONDS, (trigger) => shield.raise(trigger));
  const callCountdown = useCountdown(COUNTDOWN_SECONDS, () => {
    shield.raise('call');
    callEmergency();
  });

  // ── Recording (shares the mic with the voice trigger) ─────────────────
  const startRecording = useCallback(async () => {
    setHandingOff(true);
    await sleep(MIC_HANDOFF_MS);
    const started = await voice.start();
    if (!started) userStoppedRecording.current = true; // don't retry on its own
    setHandingOff(false);
  }, [voice]);

  const toggleRecording = useCallback(() => {
    if (voice.recording) {
      userStoppedRecording.current = true;
      voice.stop();
    } else {
      userStoppedRecording.current = false;
      startRecording();
    }
  }, [voice, startRecording]);

  // An SOS records by itself, a minute per note, until the user stops it.
  useEffect(() => {
    if (!sosActive) {
      userStoppedRecording.current = false;
      return;
    }
    if (!voice.recording && !handingOff && !userStoppedRecording.current) startRecording();
  }, [sosActive, voice.recording, handingOff, startRecording]);

  // ── SOS triggers ──────────────────────────────────────────────────────
  const beginSos = useCallback(
    (trigger) => {
      if (!sosActive && !sosCountdown.running) sosCountdown.start(trigger);
    },
    [sosActive, sosCountdown],
  );

  const { voiceAvailable } = useSosTriggers({
    enabled: phase === 'ready' && appActive && !sosActive,
    paused: voice.recording || handingOff,
    lang: i18n.language,
    onTrigger: beginSos,
  });

  useEffect(() => {
    if (phase !== 'ready' || !autoSos || autoSosDone.current) return;
    autoSosDone.current = true;
    beginSos('button');
  }, [phase, autoSos, beginSos]);

  const onSosPress = useCallback(() => {
    if (sosActive) {
      Alert.alert(t('shield.sos.stopTitle'), t('shield.sos.stopBody'), [
        { text: t('shield.sos.keepOn'), style: 'cancel' },
        { text: t('shield.sos.stop'), style: 'destructive', onPress: shield.stop },
      ]);
    } else if (sosCountdown.running) {
      sosCountdown.cancel();
    } else {
      sosCountdown.start('button');
    }
  }, [sosActive, sosCountdown, shield.stop, t]);

  const onCallPress = useCallback(() => {
    if (sosActive) callEmergency();
    else if (callCountdown.running) callCountdown.cancel();
    else callCountdown.start();
  }, [sosActive, callCountdown]);

  // ── Closing ───────────────────────────────────────────────────────────
  const exit = useCallback(async () => {
    sosCountdown.cancel();
    callCountdown.cancel();
    if (voice.recording) await voice.stop();
    const result = await shield.close();
    onLeave();
    if (result?.safeWalk?.bonus) Alert.alert(t('shield.safeWalk.title'), t('shield.safeWalk.bonus'));
  }, [sosCountdown, callCountdown, voice, shield, onLeave, t]);

  const confirmExit = useCallback(() => {
    Alert.alert(t('shield.exit.title'), t(sosActive ? 'shield.exit.bodySos' : 'shield.exit.body'), [
      { text: t('shield.exit.stay'), style: 'cancel' },
      { text: t('shield.exit.confirm'), style: 'destructive', onPress: exit },
    ]);
    return true;
  }, [sosActive, exit, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmExit);
    return () => sub.remove();
  }, [confirmExit]);

  // ── Map ───────────────────────────────────────────────────────────────
  const focus = useCallback((point, zoom = 17) => {
    mapRef.current?.animateCamera({ center: { latitude: point.lat, longitude: point.lng }, zoom }, { duration: 800 });
  }, []);

  const onUserLocation = useCallback(
    (event) => {
      const c = event.nativeEvent.coordinate;
      if (!c) return;
      lastPosition.current = { lat: c.latitude, lng: c.longitude };
      if (following) focus(lastPosition.current);
    },
    [following, focus],
  );

  const recenter = useCallback(() => {
    setFollowing(true);
    const here = lastPosition.current ?? status?.session?.position;
    if (here) focus(here);
  }, [focus, status]);

  if (phase === 'error') {
    return (
      <SafeAreaView style={[styles.flex, styles.center, styles.padded]}>
        <Ionicons name="cloud-offline" size={40} color={colors.textMuted} />
        <Text style={styles.message}>{shield.error}</Text>
        <Button label={t('common.tryAgain')} onPress={shield.retry} style={styles.fullWidth} />
        <Button
          label={t('shield.call', { number: EMERGENCY_NUMBER })}
          variant="danger"
          onPress={callEmergency}
          style={styles.fullWidth}
        />
        <Button label={t('common.goBack')} variant="text" onPress={onLeave} />
      </SafeAreaView>
    );
  }

  const start = status?.session?.position;
  if (!start) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.danger} size="large" />
        <Text style={styles.message}>{t('shield.starting')}</Text>
      </View>
    );
  }

  const block = status.block;
  const score = block?.score ?? 10;
  const color = scoreColor(score);
  const nearby = status.nearby ?? [];
  const companions = status.session.companionsNearby ?? 0;
  const hudTop = insets.top + spacing.sm;

  return (
    <View style={styles.flex}>
      {MAP_AVAILABLE ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          onUserLocationChange={onUserLocation}
          onPanDrag={() => setFollowing(false)}
          mapPadding={{ top: hudTop + HUD_HEIGHT, bottom: BAR_HEIGHT + insets.bottom, left: 0, right: 0 }}
        >
          {block?.bounds && (
            <Polygon
              coordinates={[
                { latitude: block.bounds.south, longitude: block.bounds.west },
                { latitude: block.bounds.south, longitude: block.bounds.east },
                { latitude: block.bounds.north, longitude: block.bounds.east },
                { latitude: block.bounds.north, longitude: block.bounds.west },
              ]}
              fillColor={`${color}33`}
              strokeColor={color}
              strokeWidth={2}
            />
          )}
          {nearby.map((alert) => (
            <Marker
              key={String(alert.id)}
              coordinate={{ latitude: alert.lat, longitude: alert.lng }}
              pinColor="red"
              title={t('shield.marker.title')}
              description={t('shield.banner.distance', { distance: formatDistance(alert.distanceM) })}
            />
          ))}
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noMap]} />
      )}

      {/* ── Top: close, shield state, safety score ────────────────────── */}
      <View style={[styles.hud, { top: hudTop }]}>
        <Pressable
          onPress={confirmExit}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('shield.exit.confirm')}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.pill}>
          <Ionicons
            name={sosActive ? 'alert-circle' : 'shield-checkmark'}
            size={18}
            color={sosActive ? colors.danger : colors.primary}
          />
          <View style={styles.pillText}>
            <Text style={styles.pillTitle} numberOfLines={1}>
              {sosActive
                ? t('shield.mode.sos')
                : t(status.session.mode === 'MOVING' ? 'shield.mode.moving' : 'shield.mode.still')}
            </Text>
            <Text style={styles.pillSub} numberOfLines={1}>
              {companions > 0
                ? t('shield.companions', { count: companions })
                : voiceAvailable
                  ? t('shield.triggerHint')
                  : t('shield.triggerHintNoVoice')}
            </Text>
          </View>
        </View>

        <View
          style={[styles.score, { borderColor: color }]}
          accessible
          accessibilityLabel={t('shield.safetyA11y', { score: formatScore(score) })}
        >
          <Text style={styles.scoreLabel}>{t('shield.safety')}</Text>
          <Text style={[styles.scoreValue, { color }]}>{formatScore(score)}</Text>
        </View>
      </View>

      {sosActive && (
        <View style={[styles.sosNotice, { top: hudTop + HUD_HEIGHT }]} accessibilityLiveRegion="polite">
          <Ionicons name="radio" size={16} color={colors.textOnPrimary} />
          <Text style={styles.sosNoticeText}>{t('shield.sos.notice')}</Text>
        </View>
      )}

      <NearbySosBanner
        alerts={nearby}
        top={hudTop + HUD_HEIGHT + (sosActive ? 44 : 0)}
        onFocus={(alert) => {
          setFollowing(false);
          focus(alert, 18);
        }}
      />

      {MAP_AVAILABLE && (
        <Pressable
          onPress={recenter}
          style={({ pressed }) => [
            styles.round,
            styles.recenter,
            { bottom: BAR_HEIGHT + insets.bottom + spacing.lg },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('shield.recenter')}
        >
          <Ionicons name={following ? 'navigate' : 'navigate-outline'} size={22} color={colors.primary} />
        </Pressable>
      )}

      <SosBar
        bottomInset={insets.bottom}
        sosActive={sosActive}
        sosBusy={shield.sosBusy}
        sosCountdown={sosCountdown.left}
        onSosPress={onSosPress}
        callCountdown={callCountdown.left}
        onCallPress={onCallPress}
        recording={voice.recording}
        uploading={voice.uploading}
        onRecordPress={toggleRecording}
      />

      <SosResolutionModal visible={!!status.pendingOutcome && !sosActive} onAnswer={shield.answer} />
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 6,
  elevation: 6,
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  padded: { padding: spacing.lg },
  fullWidth: { alignSelf: 'stretch' },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  hud: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    height: HUD_HEIGHT - spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  pill: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.background,
    ...shadow,
  },
  pillText: { flex: 1 },
  pillTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  pillSub: { ...typography.label, color: colors.textMuted },
  score: {
    height: 48,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    ...shadow,
  },
  scoreLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  scoreValue: { fontSize: 16, fontWeight: '900' },
  sosNotice: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: '#7F1D1D',
  },
  sosNoticeText: { ...typography.label, color: colors.textOnPrimary, fontWeight: '600', flex: 1 },
  recenter: { position: 'absolute', right: spacing.md },
  noMap: { backgroundColor: colors.surface },
});
