import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useUser } from '../context/UserContext';
import { getErrorMessage, isUnauthorized, verifyDigilocker } from '../services/api';
import {
  clearPendingDigilocker,
  clearSession,
  getPendingDigilocker,
  getUser,
  saveUser,
} from '../services/session';

// Opened by the sihconnect://aadhaar-callback deep link once the user
// finishes on DigiLocker. Reads the handshake saved by aadhaar-verify.js,
// asks the backend to fetch the KYC data, then moves on to the home screen.
export default function AadhaarCallback() {
  const { t } = useTranslation();
  const { setUser } = useUser();
  const router = useRouter();
  const [error, setError] = useState(null);
  const started = useRef(false);

  const runVerification = useCallback(async () => {
    setError(null);
    try {
      const pending = await getPendingDigilocker();
      if (!pending) {
        // Link opened without a verification in flight (e.g. tapped twice).
        router.replace('/aadhaar-verify');
        return;
      }

      const result = await verifyDigilocker(pending.clientToken, pending.state);
      const cached = await getUser();
      await saveUser({ ...cached, ...result.user });
      setUser({ ...cached, ...result.user });
      await clearPendingDigilocker();
      router.replace('/home');
    } catch (err) {
      if (isUnauthorized(err)) {
        await clearSession();
        router.replace('/auth');
        return;
      }
      setError(getErrorMessage(err, t('aadhaar.fetchFailed')));
    }
  }, [router, setUser, t]);

  useEffect(() => {
    // Guard against the effect firing twice (dev StrictMode) — the
    // DigiLocker handshake can only be redeemed once.
    if (started.current) return;
    started.current = true;
    runVerification();
  }, [runVerification]);

  const handleStartOver = useCallback(async () => {
    await clearPendingDigilocker();
    router.replace('/aadhaar-verify');
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {error ? (
        <View style={styles.card}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>{t('aadhaar.failedTitle')}</Text>
          <Text style={styles.message}>{error}</Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={runVerification}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t('common.tryAgain')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={handleStartOver}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{t('aadhaar.startOver')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <ActivityIndicator color="#0B7A4B" size="large" />
          <Text style={styles.title}>{t('aadhaar.verifying')}</Text>
          <Text style={styles.message}>{t('aadhaar.verifyingBody')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24,
    padding: 24,
  },
  icon: { fontSize: 36 },
  title: { fontSize: 20, fontWeight: '700', color: '#ffffff', textAlign: 'center' },
  message: { fontSize: 14, color: '#9999bb', lineHeight: 20, textAlign: 'center' },
  primaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#0B7A4B',
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 12,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  secondaryButton: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12 },
  secondaryButtonText: { fontSize: 14, fontWeight: '600', color: '#8888aa' },
  pressed: { opacity: 0.85 },
});
