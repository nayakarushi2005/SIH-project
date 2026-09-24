import { useState, useCallback, useEffect } from 'react';
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
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';

import { initiateDigilocker, verifyDigilocker } from '../services/api';

export default function AadhaarVerify() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [processingData, setProcessingData] = useState(false);
  const [currentClientToken, setCurrentClientToken] = useState(null);
  const [currentState, setCurrentState] = useState(null);

  // When returning from Digilocker browser flow via Deep Link
  const handleDeepLink = useCallback(async (event) => {
    // If the app was opened with our callback URL
    if (event.url && event.url.includes('aadhaar-callback') && currentClientToken && currentState) {
      setProcessingData(true);
      try {
        const verifyResult = await verifyDigilocker(currentClientToken, currentState);
        
        await SecureStore.setItemAsync('user', JSON.stringify(verifyResult.user));
        Alert.alert(
          '✅ Verified!',
          `Welcome, ${verifyResult.user.name}! Your Aadhaar has been verified via Digilocker.`,
          [{ text: 'Continue', onPress: () => router.replace('/dashboard') }]
        );
      } catch (err) {
        Alert.alert('Verification Failed', err.message || 'Could not fetch Aadhaar data.');
      } finally {
        setProcessingData(false);
        setCurrentClientToken(null);
        setCurrentState(null);
      }
    }
  }, [currentClientToken, currentState, router]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [handleDeepLink]);

  const handleStartVerification = async () => {
    setLoading(true);
    try {
      // 1. Get Digilocker URL from our backend
      const result = await initiateDigilocker();
      
      if (!result.url) {
        throw new Error('Failed to generate Digilocker link');
      }

      // Store tokens in state so we can use them when the deep link returns
      setCurrentClientToken(result.clientToken);
      setCurrentState(result.state);
      setLoading(false);

      // 2. Open the Digilocker page in the phone's default browser (Chrome/Safari)
      // This avoids the 'ExpoWebBrowser' native module crash!
      await Linking.openURL(result.url);

    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Something went wrong.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.blob} />

        <View style={styles.header}>
          <View style={styles.shieldIcon}>
            <Text style={styles.shieldEmoji}>🛡️</Text>
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
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              We do not store your full Aadhaar number. We strictly comply with UIDAI and Government data privacy guidelines.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              (loading || processingData) && styles.primaryButtonDisabled,
            ]}
            onPress={handleStartVerification}
            disabled={loading || processingData}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : processingData ? (
              <Text style={styles.primaryButtonText}>Retrieving Data...</Text>
            ) : (
              <Text style={styles.primaryButtonText}>Verify with DigiLocker →</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.poweredBy}>Secured by Meon eKYC · UIDAI Authorized</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  blob: { position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: '#0B7A4B', opacity: 0.15 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  shieldIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(11,122,75,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(11,122,75,0.4)' },
  shieldEmoji: { fontSize: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8888aa', textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  card: { width: '100%', maxWidth: 400, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 24, padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#9999bb', lineHeight: 19, marginBottom: 24 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(11,122,75,0.1)', borderWidth: 1, borderColor: 'rgba(11,122,75,0.25)', borderRadius: 10, padding: 12, marginBottom: 24 },
  privacyIcon: { fontSize: 14, marginTop: 1 },
  privacyText: { flex: 1, fontSize: 12, color: '#9999bb', lineHeight: 17 },
  primaryButton: { backgroundColor: '#0B7A4B', borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#0B7A4B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  primaryButtonPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3 },
  poweredBy: { fontSize: 11, color: '#444466', textAlign: 'center', marginTop: 8 },
});
