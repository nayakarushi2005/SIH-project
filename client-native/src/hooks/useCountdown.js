import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

/**
 * A cancellable "3… 2… 1…" before something drastic (an SOS, a call to
 * 112), with a buzz on each step. start(payload) begins it; onDone(payload)
 * runs when it reaches zero. `left` is the seconds left, or null when idle.
 */
export default function useCountdown(seconds, onDone) {
  const [left, setLeft] = useState(null);
  const payload = useRef(null);
  const finish = useEffectEvent(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    onDone(payload.current);
  });

  useEffect(() => {
    if (left === null) return undefined;
    const timer = setTimeout(() => {
      if (left <= 1) {
        setLeft(null);
        finish();
      } else {
        setLeft(left - 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const start = useCallback(
    (value) => {
      payload.current = value;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setLeft((current) => current ?? seconds);
    },
    [seconds]
  );

  const cancel = useCallback(() => {
    setLeft(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  return { left, running: left !== null, start, cancel };
}
