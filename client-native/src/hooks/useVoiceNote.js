import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import i18n from '../i18n';
import { uploadVoiceNote } from '../services/api';

const UPLOAD_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Records voice notes for the safety shield and sends each one when it
 * stops (retrying a few times on a bad network). With `maxDurationMs`, a
 * recording stops and sends itself after that long, so a long SOS goes out
 * in pieces instead of all at the end.
 * getLocation() → { lat, lng } | null, read when a note is sent.
 */
export default function useVoiceNote({ getLocation, maxDurationMs }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(0);
  const recordingRef = useRef(false);
  const startedAt = useRef(0);
  const getLocationRef = useRef(getLocation);
  useEffect(() => {
    getLocationRef.current = getLocation;
  });

  const send = useCallback(async (clip) => {
    setUploading((n) => n + 1);
    try {
      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
        try {
          const location = await Promise.resolve(getLocationRef.current?.()).catch(() => null);
          await uploadVoiceNote({ ...clip, location });
          return;
        } catch {
          if (attempt < UPLOAD_ATTEMPTS) await sleep(2000 * attempt);
        }
      }
      Alert.alert(i18n.t('common.error'), i18n.t('shield.errors.voiceUpload'));
    } finally {
      setUploading((n) => n - 1);
    }
  }, []);

  /** Starts recording. False if the microphone isn't allowed or is busy. */
  const start = useCallback(async () => {
    if (recordingRef.current) return true;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(i18n.t('common.error'), i18n.t('shield.errors.micDenied'));
      return false;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      startedAt.current = Date.now();
      setRecording(true);
      return true;
    } catch {
      return false;
    }
  }, [recorder]);

  /** Stops and sends the recording (the upload carries on in the background). */
  const stop = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (uri) send({ uri, durationMs: Date.now() - startedAt.current });
    } catch {
      // Nothing usable was recorded.
    }
  }, [recorder, send]);

  useEffect(() => {
    if (!recording || !maxDurationMs) return undefined;
    const timer = setTimeout(stop, maxDurationMs);
    return () => clearTimeout(timer);
  }, [recording, maxDurationMs, stop]);

  return { recording, uploading: uploading > 0, start, stop };
}
