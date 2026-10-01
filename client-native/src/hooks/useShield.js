import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, DeviceEventEmitter } from 'react-native';
import * as Location from 'expo-location';

import i18n from '../i18n';
import {
  cancelSos,
  closeShield,
  getErrorMessage,
  getShieldStatus,
  openShield,
  raiseSos,
  sendSosOutcome,
} from '../services/api';
import {
  EMERGENCY_NUMBER,
  SHIELD_CLOSED_EVENT,
  SHIELD_STATUS_EVENT,
  callEmergency,
  publishStatus,
  reportLocation,
  requestBackgroundLocation,
  startShieldServices,
  stopShieldServices,
  toPoint,
} from '../services/shield';

const POLL_MS = 5000;

/**
 * Runs an open safety shield for its screen: opens it on the server, feeds
 * it positions from one source (see services/shield.js), polls while the app
 * is in front, and exposes the SOS actions.
 *
 * phase: 'starting' | 'ready' | 'error'. `status` is the server's shield
 * status: { trust, session, block, sos, nearby, pendingOutcome }.
 * onClosedElsewhere runs when the shield is closed from its notification.
 */
export default function useShield({ onClosedElsewhere }) {
  const [phase, setPhase] = useState('starting');
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState(null);
  const [sosBusy, setSosBusy] = useState(false);
  const statusRef = useRef(null);
  const closingRef = useRef(false);
  const onClosedRef = useRef(onClosedElsewhere);
  useEffect(() => {
    onClosedRef.current = onClosedElsewhere;
  });

  const apply = useCallback((next) => {
    if (!next || closingRef.current) return;
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Everything that reaches the server — positions, polls, SOS — comes back
  // through here, from this screen or the background task.
  useEffect(() => {
    const statusSub = DeviceEventEmitter.addListener(SHIELD_STATUS_EVENT, apply);
    const closedSub = DeviceEventEmitter.addListener(SHIELD_CLOSED_EVENT, () => {
      closingRef.current = true;
      onClosedRef.current?.();
    });
    return () => {
      statusSub.remove();
      closedSub.remove();
    };
  }, [apply]);

  // Open the shield and start the one location source.
  useEffect(() => {
    let active = true;
    let watcher = null;

    (async () => {
      try {
        setPhase('starting');
        const background = await requestBackgroundLocation();
        if (!active) return;
        if (!background) {
          Alert.alert(i18n.t('shield.backgroundTitle'), i18n.t('shield.backgroundBody'));
        }

        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!active) return;
        publishStatus(await openShield(toPoint(fix.coords)));
        if (!active) return;
        setPhase('ready');

        const backgroundRunning = await startShieldServices({ background, sos: !!statusRef.current?.sos });
        if (!backgroundRunning && active) {
          watcher = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
            (location) => reportLocation(location.coords).catch(() => {})
          );
          if (!active) watcher.remove();
        }
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, i18n.t('shield.errors.start')));
        setPhase('error');
      }
    })();

    return () => {
      active = false;
      watcher?.remove();
    };
  }, [attempt]);

  // Poll while in front: SOS alerts nearby change even when we stand still,
  // and each poll tells the server the shield is still in use.
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let timer = null;
    const reopen = async () => {
      const last = await Location.getLastKnownPositionAsync();
      if (last && !closingRef.current) publishStatus(await openShield(toPoint(last.coords)));
    };
    const poll = async () => {
      try {
        const next = await getShieldStatus();
        // The server closed a shield it stopped hearing from (e.g. the app
        // sat in the background without background location): reopen it.
        if (!next.session && !closingRef.current) await reopen();
        else publishStatus(next);
      } catch {
        // Offline for now; the next poll tries again.
      }
    };
    const start = () => {
      if (!timer) timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };

    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        poll();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [phase]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Sends an SOS. On failure offers to retry or to call the emergency number. */
  const raise = useCallback(async function send(trigger) {
    if (statusRef.current?.sos) return true;
    setSosBusy(true);
    try {
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      publishStatus(await raiseSos({ location: last ? toPoint(last.coords) : undefined, trigger }));
      return true;
    } catch (err) {
      Alert.alert(
        i18n.t('shield.errors.sosTitle'),
        getErrorMessage(err, i18n.t('shield.errors.sos', { number: EMERGENCY_NUMBER })),
        [
          { text: i18n.t('common.tryAgain'), onPress: () => send(trigger) },
          { text: i18n.t('shield.call', { number: EMERGENCY_NUMBER }), onPress: callEmergency },
        ]
      );
      return false;
    } finally {
      setSosBusy(false);
    }
  }, []);

  /** Turns the SOS off; the status then asks whether it was real. */
  const stop = useCallback(async () => {
    setSosBusy(true);
    try {
      publishStatus(await cancelSos());
    } catch (err) {
      Alert.alert(i18n.t('common.error'), getErrorMessage(err, i18n.t('shield.errors.stop')));
    } finally {
      setSosBusy(false);
    }
  }, []);

  /** outcome: 'false_alarm' | 'real_emergency'. Asked again later if sending fails. */
  const answer = useCallback(
    async (outcome) => {
      const id = statusRef.current?.pendingOutcome?.id;
      if (!id) return;
      apply({ ...statusRef.current, pendingOutcome: null });
      try {
        await sendSosOutcome(id, outcome);
      } catch {
        // The next status brings the question back.
      }
      getShieldStatus().then(publishStatus).catch(() => {});
    },
    [apply]
  );

  /** Closes the shield everywhere. Returns the server's answer, or null offline. */
  const close = useCallback(async () => {
    closingRef.current = true;
    await stopShieldServices();
    try {
      return await closeShield();
    } catch {
      return null; // the server closes it once it stops hearing from us
    }
  }, []);

  return {
    phase,
    error,
    status,
    sosActive: !!status?.sos,
    sosBusy,
    retry,
    raise,
    stop,
    answer,
    close,
  };
}
