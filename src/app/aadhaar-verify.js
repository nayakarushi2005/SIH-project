import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { initiateAadhaarOTP, verifyAadhaarOTP } from '../services/api';

// Format Aadhaar input as XXXX XXXX XXXX
function formatAadhaar(text) {
  const digits = text.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export default function AadhaarVerify() {
  const router = useRouter();
  useLocalSearchParams(); // consumed by routing; no fields needed here

  // Step 1: Aadhaar entry | Step 2: OTP entry
  const [step, setStep] = useState(1);
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  // Animated progress bar – stored in state so it survives re-renders without triggering ref rules
  const [progress] = useState(() => new Animated.Value(0));

  const animateProgress = useCallback((toValue) => {
    Animated.spring(progress, {
      toValue,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
  }, [progress]);

  // ── Step 1: Send OTP ───────────────────────────────────────────────────
  const handleSendOTP = useCallback(async () => {
    const rawAadhaar = aadhaarInput.replace(/\s/g, '');
    if (rawAadhaar.length !== 12) {
      Alert.alert('Invalid Aadhaar', 'Please enter your 12-digit Aadhaar number.');
      return;
    }

    setLoading(true);
    try {
      const result = await initiateAadhaarOTP(rawAadhaar);
      setTransactionId(result.transactionId);
      setStep(2);
      animateProgress(1);
    } catch (err) {
      Alert.alert('OTP Error', err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [aadhaarInput, animateProgress]);

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────
  const handleVerifyOTP = useCallback(async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your mobile.');
      return;
    }

    const rawAadhaar = aadhaarInput.replace(/\s/g, '');
    const aadhaarLastFour = rawAadhaar.slice(-4);

    setLoading(true);
    try {
      const result = await verifyAadhaarOTP(transactionId, otp, aadhaarLastFour);

      // Save updated user locally
      await SecureStore.setItemAsync('user', JSON.stringify(result.user));

      Alert.alert(
        '✅ Verified!',
        `Welcome, ${result.user.name}! Your Aadhaar has been verified.`,
        [{ text: 'Continue', onPress: () => router.replace('/dashboard') }]
      );
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [otp, transactionId, aadhaarInput, router]);

  // Derive interpolated width
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Decorative blob */}
          <View style={styles.blob} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.shieldIcon}>
              <Text style={styles.shieldEmoji}>🛡️</Text>
            </View>
            <Text style={styles.title}>Aadhaar Verification</Text>
            <Text style={styles.subtitle}>
              We use Aadhaar eKYC to verify your identity securely via OTP
            </Text>
          </View>

          {/* Progress Steps */}
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.stepDotActive]}>
                <Text style={styles.stepDotText}>{step > 1 ? '✓' : '1'}</Text>
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelActive]}>Aadhaar</Text>
            </View>
            <View style={styles.stepLine}>
              <Animated.View style={[styles.stepLineFill, { width: progressWidth }]} />
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, step === 2 && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, step < 2 && styles.stepDotTextInactive]}>
                  2
                </Text>
              </View>
              <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>
                Verify OTP
              </Text>
            </View>
          </View>

          {/* ── Step 1: Enter Aadhaar ────────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Enter Aadhaar Number</Text>
              <Text style={styles.cardDesc}>
                An OTP will be sent to your Aadhaar-linked mobile number
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Aadhaar Number</Text>
                <TextInput
                  style={styles.input}
                  value={aadhaarInput}
                  onChangeText={(t) => setAadhaarInput(formatAadhaar(t))}
                  placeholder="XXXX XXXX XXXX"
                  placeholderTextColor="#555577"
                  keyboardType="number-pad"
                  maxLength={14} // 12 digits + 2 spaces
                  returnKeyType="done"
                  accessibilityLabel="Aadhaar number input"
                />
                <Text style={styles.inputHint}>
                  {aadhaarInput.replace(/\s/g, '').length}/12 digits
                </Text>
              </View>

              <View style={styles.privacyNote}>
                <Text style={styles.privacyIcon}>🔒</Text>
                <Text style={styles.privacyText}>
                  Your Aadhaar number is encrypted and only the last 4 digits are stored.
                  We comply with UIDAI data privacy guidelines.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  loading && styles.primaryButtonDisabled,
                ]}
                onPress={handleSendOTP}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send OTP →</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Enter OTP ───────────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Enter OTP</Text>
              <Text style={styles.cardDesc}>
                A 6-digit OTP has been sent to the mobile number linked with Aadhaar{' '}
                <Text style={styles.highlight}>
                  XXXX-XXXX-{aadhaarInput.replace(/\s/g, '').slice(-4)}
                </Text>
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>OTP</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  placeholderTextColor="#555577"
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  accessibilityLabel="OTP input"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  loading && styles.primaryButtonDisabled,
                ]}
                onPress={handleVerifyOTP}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify & Continue →</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.resendButton}
                onPress={() => { setStep(1); setOtp(''); animateProgress(0); }}
                accessibilityRole="button"
              >
                <Text style={styles.resendText}>← Change Aadhaar number</Text>
              </Pressable>
            </View>
          )}

          {/* Powered by */}
          <Text style={styles.poweredBy}>Secured by Meon eKYC · UIDAI Authorized</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  blob: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0B7A4B',
    opacity: 0.15,
  },

  // ── Header ───────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  shieldIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(11,122,75,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(11,122,75,0.4)',
  },
  shieldEmoji: { fontSize: 32 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8888aa',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },

  // ── Progress steps ────────────────────────────────────────────────────
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    width: '100%',
    maxWidth: 360,
  },
  stepItem: {
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  stepDotActive: {
    backgroundColor: '#0B7A4B',
    borderColor: '#0B7A4B',
  },
  stepDotText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  stepDotTextInactive: {
    color: '#666688',
  },
  stepLabel: {
    fontSize: 11,
    color: '#666688',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#0B7A4B',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
    borderRadius: 1,
    overflow: 'hidden',
  },
  stepLineFill: {
    height: '100%',
    backgroundColor: '#0B7A4B',
    borderRadius: 1,
  },

  // ── Card ──────────────────────────────────────────────────────────────
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: '#9999bb',
    lineHeight: 19,
    marginBottom: 24,
  },
  highlight: {
    color: '#0B7A4B',
    fontWeight: '700',
  },

  // ── Input ────────────────────────────────────────────────────────────
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8888aa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
    letterSpacing: 2,
  },
  otpInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 22,
  },
  inputHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#555577',
    textAlign: 'right',
  },

  // ── Privacy note ──────────────────────────────────────────────────────
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(11,122,75,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(11,122,75,0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
  },
  privacyIcon: { fontSize: 14, marginTop: 1 },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: '#9999bb',
    lineHeight: 17,
  },

  // ── Buttons ───────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: '#0B7A4B',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0B7A4B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 13,
    color: '#8888aa',
    fontWeight: '500',
  },

  // ── Powered by ────────────────────────────────────────────────────────
  poweredBy: {
    fontSize: 11,
    color: '#444466',
    textAlign: 'center',
    marginTop: 8,
  },
});
