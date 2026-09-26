import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

// App language → speech locale (Indian English/Hindi/… voices and recognisers).
const LOCALES = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN' };

// Recogniser errors that mean "voice won't work on this phone".
const UNAVAILABLE = ['service-not-allowed', 'language-not-supported', 'audio-capture'];

/**
 * Speech on the phone: `speak(text)` reads aloud with text-to-speech and
 * resolves when done; `listen()` turns one spoken answer into text with the
 * phone's recogniser and resolves with the transcript ('' if nothing was
 * said). Nothing is recorded or sent anywhere except the final text.
 * listen() rejects with { code: 'denied' | 'unavailable' | 'error' }.
 */
export default function useVoice(lang) {
  const locale = LOCALES[lang] ?? 'en-IN';
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const pending = useRef(null); // { resolve, reject, latest }
  const permitted = useRef(null);
  // Resolves when the recogniser has fully stopped; a new listen waits for
  // it so an aborted session's late events can't answer the new one.
  const ended = useRef(Promise.resolve());
  const markEnded = useRef(() => {});

  const settle = useCallback((fn) => {
    const p = pending.current;
    pending.current = null;
    setListening(false);
    if (p) fn(p);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript ?? '';
    setPartial(text);
    if (pending.current) pending.current.latest = text;
    if (event.isFinal) settle((p) => p.resolve(text));
  });

  useSpeechRecognitionEvent('end', () => {
    settle((p) => p.resolve(p.latest ?? ''));
    markEnded.current();
  });

  useSpeechRecognitionEvent('error', (event) => {
    settle((p) => {
      if (event.error === 'not-allowed') p.reject({ code: 'denied' });
      else if (UNAVAILABLE.includes(event.error)) p.reject({ code: 'unavailable' });
      else if (['no-speech', 'speech-timeout', 'aborted'].includes(event.error)) p.resolve(p.latest ?? '');
      else p.reject({ code: 'error', message: event.message });
    });
  });

  const speak = useCallback(
    (text) =>
      new Promise((resolve) => {
        Speech.stop();
        if (!text) {
          resolve();
          return;
        }
        Speech.speak(text, { language: locale, onDone: resolve, onStopped: resolve, onError: resolve });
      }),
    [locale]
  );

  const listen = useCallback(
    async ({ contextualStrings } = {}) => {
      if (permitted.current === null) {
        const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        permitted.current = res.granted;
      }
      if (!permitted.current) throw { code: 'denied' };
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) throw { code: 'unavailable' };
      // Finish any earlier session first (e.g. the mic was tapped while listening).
      if (pending.current) {
        settle((p) => p.resolve(''));
        ExpoSpeechRecognitionModule.abort();
      }
      await Promise.race([ended.current, new Promise((r) => setTimeout(r, 1500))]);
      ended.current = new Promise((r) => {
        markEnded.current = r;
      });
      setPartial('');
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject, latest: '' };
        setListening(true);
        ExpoSpeechRecognitionModule.start({
          lang: locale,
          interimResults: true,
          continuous: false,
          // Hints help the recogniser with job names ("plumber", "मिस्त्री").
          contextualStrings: contextualStrings?.slice(0, 100),
        });
      });
    },
    [locale, settle]
  );

  /** Stop talking and listening (used before a tap and on leaving the screen). */
  const stop = useCallback(() => {
    Speech.stop();
    if (pending.current) ExpoSpeechRecognitionModule.abort();
  }, []);

  useEffect(() => stop, [stop]);

  return { speak, listen, stop, listening, partial };
}
