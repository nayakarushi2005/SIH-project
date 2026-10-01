import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { addVolumeListener, showNativeVolumeUI } from 'react-native-volume-manager';

import { LOCALES } from './useVoice';

// Words that start an SOS, per app language. English "help"/"SOS" and Hindi
// "bachao" work everywhere since people switch languages under stress.
const COMMON = ['help', 'sos', 'bachao', 'बचाओ'];
const KEYWORDS = {
  en: [],
  hi: ['मदद', 'हेल्प', 'एसओएस'],
  mr: ['वाचवा', 'मदत', 'हेल्प'],
  bn: ['বাঁচাও', 'বাচাও', 'সাহায্য'],
  ta: ['காப்பாற்று', 'காப்பாத்து', 'உதவி'],
  te: ['కాపాడండి', 'కాపాడు', 'సహాయం'],
};

const RESTART_DELAY_MS = 300; // lets the recogniser release the mic before we take it again
const BUSY_RETRY_MS = 2000;
const UNAVAILABLE = ['not-allowed', 'service-not-allowed', 'language-not-supported'];

const VOLUME_PRESSES = 3;
const VOLUME_WINDOW_MS = 2000;

/**
 * Hands-free SOS while the shield screen is in front: saying a keyword, or
 * pressing a volume key three times within two seconds, calls
 * onTrigger('voice' | 'volume'). The recogniser restarts itself whenever it
 * stops; `paused` frees the microphone (e.g. while recording a voice note).
 * Returns { voiceAvailable }.
 */
export default function useSosTriggers({ enabled, paused, lang, onTrigger }) {
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const locale = LOCALES[lang] ?? 'en-IN';
  const keywords = useMemo(() => [...COMMON, ...(KEYWORDS[lang] ?? [])], [lang]);
  const wanted = enabled && !paused && voiceAvailable;

  // Latest values for the recogniser's event handlers and timers.
  const wantedRef = useRef(wanted);
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    wantedRef.current = wanted;
    onTriggerRef.current = onTrigger;
  });
  const listening = useRef(false);
  const timer = useRef(null);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    if (!wantedRef.current || listening.current) return;
    listening.current = true;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: true,
        contextualStrings: keywords,
      });
    } catch {
      listening.current = false;
    }
  }, [locale, keywords]);

  const restartLater = useCallback(
    (ms) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(start, ms);
    },
    [start]
  );

  useSpeechRecognitionEvent('result', (event) => {
    if (!listening.current) return;
    const heard = (event.results ?? []).map((r) => (r?.transcript ?? '').toLowerCase());
    if (heard.some((text) => keywords.some((word) => text.includes(word)))) {
      listening.current = false;
      ExpoSpeechRecognitionModule.abort();
      onTriggerRef.current('voice');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!listening.current) return;
    if (UNAVAILABLE.includes(event.error)) {
      listening.current = false;
      setVoiceAvailable(false);
    } else if (event.error === 'audio-capture') {
      listening.current = false;
      restartLater(BUSY_RETRY_MS); // someone else has the mic for now
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (!listening.current) return;
    listening.current = false;
    restartLater(RESTART_DELAY_MS);
  });

  // Start and stop the listening loop.
  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false;
    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((permission) => {
        if (cancelled) return;
        if (permission.granted) restartLater(RESTART_DELAY_MS);
        else setVoiceAvailable(false);
      })
      .catch(() => !cancelled && setVoiceAvailable(false));

    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      if (listening.current) {
        listening.current = false;
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [wanted, restartLater]);

  // Volume keys.
  useEffect(() => {
    if (!enabled) return undefined;
    let presses = [];
    let subscription = null;
    try {
      showNativeVolumeUI({ enabled: false }).catch(() => {});
      subscription = addVolumeListener(() => {
        const now = Date.now();
        presses = presses.filter((at) => now - at < VOLUME_WINDOW_MS);
        presses.push(now);
        if (presses.length >= VOLUME_PRESSES) {
          presses = [];
          onTriggerRef.current('volume');
        }
      });
    } catch {
      // Not in this build (e.g. Expo Go); the other triggers still work.
    }
    return () => {
      subscription?.remove();
      showNativeVolumeUI({ enabled: true }).catch(() => {});
    };
  }, [enabled]);

  return { voiceAvailable };
}
