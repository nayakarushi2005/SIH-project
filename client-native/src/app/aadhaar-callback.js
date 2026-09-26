import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { getErrorMessage, isUnauthorized, verifyDigilocker } from '../services/api';
import {
  clearPendingDigilocker,
  clearSession,
  getPendingDigilocker,
  getUser,
  saveUser,
} from '../services/session';

export default function AadhaarCallback() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const started = useRef(false);

  const runVerification = useCallback(async () => {
    setError(null);
    try {
      const pending = await getPendingDigilocker();
      if (!pending) {
        router.replace('/aadhaar-verify');
        return;
      }

      const result = await verifyDigilocker(pending.clientToken, pending.state);
      const cached = await getUser();
      await saveUser({ ...cached, ...result.user });
      await clearPendingDigilocker();
      router.replace('/home');
    } catch (err) {
      if (isUnauthorized(err)) {
        await clearSession();
        router.replace('/auth');
        return;
      }
      setError(getErrorMessage(err, 'Could not fetch your Aadhaar details.'));
    }
  }, [router]);

  useEffect(() => {
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
      <StatusBar style="dark" />

      {error ? (
        <View style={styles.card}>
          <Ionicons name="warning" size={36} color="#F59E0B" />
          <Text style={styles.title}>Verification failed</Text>
          <Text style={styles.message}>{error}</Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={runVerification}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={handleStartOver}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Start over</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <ActivityIndicator color="#0B7A4B" size="large" />
          <Text style={styles.title}>Verifying with DigiLocker…</Text>
          <Text style={styles.message}>Fetching your details securely. This takes a few seconds.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
    borderRadius: 24,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', textAlign: 'center' },
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
