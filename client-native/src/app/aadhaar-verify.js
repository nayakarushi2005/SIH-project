import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

import { getErrorMessage, initiateDigilocker } from '../services/api';
import { savePendingDigilocker } from '../services/session';

export default function AadhaarVerify() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStartVerification = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initiateDigilocker();
      if (!result?.url || !result.clientToken || !result.state) {
        throw new Error('Could not start DigiLocker verification.');
      }

      await savePendingDigilocker(result);
      await Linking.openURL(result.url);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSkip = useCallback(() => {
    router.replace('/home');
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.blob} />

        <View style={styles.header}>
          <View style={styles.shieldIcon}>
            <Ionicons name="shield-checkmark" size={34} color="#0B7A4B" />
          </View>
          <Text style={styles.title}>DigiLocker Verification</Text>
          <Text style={styles.subtitle}>
            We securely verify your identity using the official Govt. of India DigiLocker service.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Verify your Identity</Text>
          <Text style={styles.cardDesc}>
            You will be redirected to DigiLocker to authorize the sharing of your Aadhaar details securely.
          </Text>

          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed" size={14} color="#9999bb" style={styles.privacyIcon} />
            <Text style={styles.privacyText}>
              We do not store your full Aadhaar number. We strictly comply with UIDAI and Government data privacy guidelines.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              loading && styles.primaryButtonDisabled,
            ]}
            onPress={handleStartVerification}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify with DigiLocker →</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.6 }]}
            onPress={handleSkip}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>I&apos;ll do this later</Text>
          </Pressable>
        </View>

        <Text style={styles.poweredBy}>Secured by Meon eKYC · UIDAI Authorized</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  blob: { position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: '#0B7A4B', opacity: 0.15 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  shieldIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(11,122,75,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(11,122,75,0.4)' },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a2e', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8888aa', textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  card: { width: '100%', maxWidth: 400, backgroundColor: 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.09)', borderRadius: 24, padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#9999bb', lineHeight: 19, marginBottom: 24 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(11,122,75,0.1)', borderWidth: 1, borderColor: 'rgba(11,122,75,0.25)', borderRadius: 10, padding: 12, marginBottom: 24 },
  privacyIcon: { marginTop: 1 },
  privacyText: { flex: 1, fontSize: 12, color: '#9999bb', lineHeight: 17 },
  primaryButton: { backgroundColor: '#0B7A4B', borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#0B7A4B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  primaryButtonPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3 },
  skipButton: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  skipText: { fontSize: 14, color: '#8888aa', fontWeight: '600' },
  poweredBy: { fontSize: 11, color: '#444466', textAlign: 'center', marginTop: 8 },
});
