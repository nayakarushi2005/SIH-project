import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

import { googleSignIn } from '../services/api';

// Configure Google Sign-In — webClientId from .env
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

// Google logo as a safe static require — avoids SVG parsing issues with ESLint
// Falls back to a styled 'G' if no local asset is present
const GOOGLE_LOGO_URL =
  'https://www.google.com/favicon.ico'; // replaced with local asset in production

export default function Auth() {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  // Store Animated.Value in state to avoid accessing refs during render
  const [tabAnim] = useState(() => new Animated.Value(0));

  const switchTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      Animated.spring(tabAnim, {
        toValue: tab === 'login' ? 0 : 1,
        useNativeDriver: false,
        tension: 80,
        friction: 12,
      }).start();
    },
    [tabAnim]
  );

  const { width } = useWindowDimensions();
  const router = useRouter();

  // Derive interpolation
  const tabIndicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '51%'],
  });

  const handleGoogleAuth = useCallback(async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) throw new Error('Failed to get Google ID token');

      const result = await googleSignIn(idToken);

      // Persist JWT
      await SecureStore.setItemAsync('authToken', result.token);
      await SecureStore.setItemAsync('user', JSON.stringify(result.user));

      if (result.needsAadhaarVerification) {
        // New user OR existing user without Aadhaar → go verify
        router.replace({
          pathname: '/aadhaar-verify',
          params: { isNewUser: result.isNewUser ? '1' : '0' },
        });
      } else {
        // Returning verified user → straight to dashboard
        router.replace('/dashboard');
      }
    } catch (err) {
      if (err.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert(
          'Authentication Failed',
          err.message || 'Something went wrong. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Background gradient blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      {/* Logo / Brand */}
      <View style={styles.brandSection}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>✦</Text>
        </View>
        <Text style={styles.brandName}>SIH Connect</Text>
        <Text style={styles.tagline}>Verified professionals, trusted services</Text>
      </View>

      {/* Card */}
      <View style={[styles.card, { width: Math.min(width - 40, 400) }]}>
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft }]} />
          <Pressable
            style={styles.tab}
            onPress={() => switchTab('login')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'login' }}
          >
            <Text style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}>
              Login
            </Text>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => switchTab('signup')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'signup' }}
          >
            <Text style={[styles.tabText, activeTab === 'signup' && styles.tabTextActive]}>
              Sign Up
            </Text>
          </Pressable>
        </View>

        {/* Description */}
        <Text style={styles.description}>
          {activeTab === 'login'
            ? 'Welcome back! Sign in to continue.'
            : "Create your account. We'll verify your identity with Aadhaar."}
        </Text>

        {/* Google Sign-In Button */}
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
          onPress={handleGoogleAuth}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`${activeTab === 'login' ? 'Login' : 'Sign up'} with Google`}
        >
          {loading ? (
            <ActivityIndicator color="#1a1a2e" size="small" />
          ) : (
            <>
              <Image
                source={{ uri: GOOGLE_LOGO_URL }}
                style={styles.googleIcon}
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>
                {activeTab === 'login' ? 'Continue with Google' : 'Sign up with Google'}
              </Text>
            </>
          )}
        </Pressable>

        {/* Info note */}
        <Text style={styles.note}>
          {activeTab === 'signup'
            ? '🔐 New accounts require Aadhaar verification via OTP'
            : '🔒 Your credentials are secured and never stored'}
        </Text>
      </View>

      {/* Terms */}
      <Text style={styles.terms}>
        By continuing, you agree to our{' '}
        <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
        <Text style={styles.termsLink}>Privacy Policy</Text>
      </Text>
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

  // ── Decorative blobs ─────────────────────────────────────────────────────
  blobTop: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#0B7A4B',
    opacity: 0.18,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#3b82f6',
    opacity: 0.12,
  },

  // ── Brand section ────────────────────────────────────────────────────────
  brandSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0B7A4B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#0B7A4B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  logoText: {
    fontSize: 28,
    color: '#fff',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: '#8888aa',
    textAlign: 'center',
  },

  // ── Card ────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 24,
    alignSelf: 'center',
  },

  // ── Tab switcher ─────────────────────────────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 24,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '47%',
    backgroundColor: '#0B7A4B',
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8888aa',
  },
  tabTextActive: {
    color: '#ffffff',
  },

  // ── Description ──────────────────────────────────────────────────────────
  description: {
    fontSize: 14,
    color: '#aaaacc',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },

  // ── Google button ────────────────────────────────────────────────────────
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  googleButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  googleIcon: {
    width: 22,
    height: 22,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: 0.2,
  },

  // ── Note ─────────────────────────────────────────────────────────────────
  note: {
    marginTop: 16,
    fontSize: 12,
    color: '#666688',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Terms ─────────────────────────────────────────────────────────────────
  terms: {
    marginTop: 28,
    fontSize: 11,
    color: '#555577',
    textAlign: 'center',
  },
  termsLink: {
    color: '#0B7A4B',
    fontWeight: '600',
  },
});
