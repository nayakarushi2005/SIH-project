import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { useTranslation } from 'react-i18next';

import i18n from '../i18n';
import { getErrorMessage, googleSignIn } from '../services/api';
import { useUser } from '../context/UserContext';
import { applyLanguage, setAppLanguage } from '../i18n/language';
import { hasChosenLanguage, saveSession } from '../services/session';
import LanguagePrompt from '../components/LanguagePrompt';
import { colors, fonts } from '../constants/theme';

const appLogo = require('../../assets/logo.png');
const APP_LOGO_ASPECT_RATIO = 1816 / 1479;
const googleLogo = require('../../assets/google_login.png');
const GOOGLE_LOGO_ASPECT_RATIO = 2400 / 811;

// Configure Google Sign-In — webClientId from .env
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
  console.warn('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — Google Sign-In will fail.');
}

function googleErrorMessage(err) {
  if (isErrorWithCode(err)) {
    switch (err.code) {
      case statusCodes.IN_PROGRESS:
        return i18n.t('auth.inProgress');
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return i18n.t('auth.playServices');
      case 'DEVELOPER_ERROR':
      case '10':
        // Almost always a SHA-1 / package-name mismatch in Google Cloud Console.
        return i18n.t('auth.misconfigured');
    }
  }
  return getErrorMessage(err);
}

export default function Auth() {
  const { t } = useTranslation();
  const { clear, setUser } = useUser();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [languageStep, setLanguageStep] = useState(null);
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

  const goNext = useCallback(
    (result) => {
      if (result.needsAadhaarVerification) {
        // New user OR existing user without Aadhaar → go verify
        router.replace({
          pathname: '/aadhaar-verify',
          params: { isNewUser: result.isNewUser ? '1' : '0' },
        });
      } else {
        // Returning verified user → straight to home
        router.replace('/home');
      }
    },
    [router]
  );

  const handleGoogleAuth = useCallback(async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      // The user closed the account picker — not an error.
      if (!isSuccessResponse(response)) return;

      const idToken = response.data.idToken;
      if (!idToken) throw new Error(i18n.t('auth.noIdToken'));

      const result = await googleSignIn(idToken);
      await saveSession(result.token, result.user);
      // Never show a previous account's profile to this one.
      clear();
      setUser(result.user);
      // A returning user on a new phone: switch to their language before
      // the Aadhaar screen opens.
      if (result.user?.preferredLanguage) await applyLanguage(result.user.preferredLanguage);

      if (!result.isNewUser && (await hasChosenLanguage().catch(() => true))) goNext(result);
      else setLanguageStep(result);
    } catch (err) {
      if (!(isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED)) {
        Alert.alert(t('auth.failedTitle'), googleErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [clear, goNext, setUser, t]);

  const handleLanguageConfirm = useCallback(
    async (code) => {
      const updated = await setAppLanguage(code);
      setUser(updated);
      const next = languageStep;
      setLanguageStep(null);
      goNext(next);
    },
    [goNext, languageStep, setUser]
  );

  const handleLanguageSkip = useCallback(() => {
    const next = languageStep;
    setLanguageStep(null);
    goNext(next);
  }, [goNext, languageStep]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Background gradient blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      {/* Logo / Brand */}
      <View style={styles.brandSection}>
        <Image
          source={appLogo}
          style={styles.appLogo}
          resizeMode="contain"
          accessible={false}
        />
        <Text style={styles.brandName}>{t('auth.brandName')}</Text>
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>
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
              {t('auth.login')}
            </Text>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => switchTab('signup')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'signup' }}
          >
            <Text style={[styles.tabText, activeTab === 'signup' && styles.tabTextActive]}>
              {t('auth.signup')}
            </Text>
          </Pressable>
        </View>

        {/* Description */}
        <Text style={styles.description}>
          {activeTab === 'login' ? t('auth.loginDescription') : t('auth.signupDescription')}
        </Text>

        {/* Google Sign-In Button */}
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
          onPress={handleGoogleAuth}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={activeTab === 'login' ? t('auth.loginA11y') : t('auth.signupA11y')}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            (activeTab === 'login' ? t('auth.continueWithGoogle') : t('auth.signupWithGoogle'))
              .split('Google')
              .map((part, i) => (
                <View key={i} style={styles.googleButtonPart}>
                  {i > 0 ? (
                    <View style={styles.googleLogo}>
                      <Image
                        source={googleLogo}
                        style={styles.googleLogoImage}
                        resizeMode="contain"
                        accessible={false}
                      />
                    </View>
                  ) : null}
                  {part.trim() ? (
                    <Text style={styles.googleButtonText}>{part.trim()}</Text>
                  ) : null}
                </View>
              ))
          )}
        </Pressable>

        {/* Info note */}
        <Text style={styles.note}>
          {activeTab === 'signup' ? t('auth.signupNote') : t('auth.loginNote')}
        </Text>
      </View>

      {languageStep ? (
        <LanguagePrompt onConfirm={handleLanguageConfirm} onSkip={handleLanguageSkip} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: '#097D4C',
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
  appLogo: {
    height: 64,
    width: 64 * APP_LOGO_ASPECT_RATIO,
    marginBottom: 14,
  },
  brandName: {
    fontSize: 28,
    fontFamily: fonts.brand,
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ── Card ────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 24,
    alignSelf: 'center',
  },

  // ── Tab switcher ─────────────────────────────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.border,
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
    backgroundColor: '#097D4C',
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
    color: colors.textMuted,
  },
  tabTextActive: {
    color: '#ffffff',
  },

  // ── Description ──────────────────────────────────────────────────────────
  description: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },

  // ── Google button ────────────────────────────────────────────────────────
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  googleButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  googleButtonPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  googleLogo: {
    height: 20,
    width: 20 * GOOGLE_LOGO_ASPECT_RATIO,
    overflow: 'hidden',
  },
  googleLogoImage: {
    width: '100%',
    height: '100%',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },

  // ── Note ─────────────────────────────────────────────────────────────────
  note: {
    marginTop: 16,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
