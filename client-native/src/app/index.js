import { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import LanguagePrompt from '../components/LanguagePrompt';
import LoadingScreen from '../components/LoadingScreen';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { setAppLanguage } from '../i18n/language';
import { getToken, hasChosenLanguage } from '../services/session';

const SUBTEXT_COLOR = '#F2F2F2';

// Caps OS-level font scaling so large accessibility sizes stay usable
// without breaking the layout.
const MAX_FONT_SCALE = 1.4;

export default function Landing() {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardProgress] = useState(() => new Animated.Value(0));
  // null while we check SecureStore, then the route to send the user to
  // (or false to show the landing screen).
  const [sessionRoute, setSessionRoute] = useState(null);
  const [askLanguage, setAskLanguage] = useState(false);
  const { setUser } = useUser();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let route = false;
      let ask = false;
      try {
        // Signed-in users go straight home; unverified ones are nudged to
        // verify from their profile rather than blocked at launch.
        if (await getToken()) {
          route = '/home';
          ask = !(await hasChosenLanguage());
        }
      } catch {
        // Unreadable storage — fall through to the landing screen.
      }
      if (!cancelled) {
        setAskLanguage(ask);
        setSessionRoute(route);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionRoute !== false) return;
    Animated.timing(cardProgress, {
      toValue: 1,
      duration: 450,
      delay: 300,
      useNativeDriver: true,
    }).start();
  }, [sessionRoute, cardProgress]);

  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    // replace (not push) so the back button/gesture on Auth exits the app
    // instead of returning to the landing screen.
    router.replace('/auth');
  }, [router]);

  const handleLanguageConfirm = async (code) => {
    const updated = await setAppLanguage(code);
    setUser(updated);
    setAskLanguage(false);
  };

  if (sessionRoute && askLanguage) {
    return (
      <View style={styles.container}>
        <LoadingScreen />
        <LanguagePrompt onConfirm={handleLanguageConfirm} onSkip={() => setAskLanguage(false)} />
      </View>
    );
  }

  if (sessionRoute) return <Redirect href={sessionRoute} />;

  if (sessionRoute === null) {
    return <LoadingScreen />;
  }

  const cardTranslate = cardProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  return (
    <View style={styles.container}>
      <LoadingScreen />

      <Animated.View
        style={[
          styles.card,
          { paddingBottom: insets.bottom + spacing.lg },
          { transform: [{ translateY: cardTranslate }] },
        ]}
      >
        <Text style={styles.subText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {t('landing.subtitle')}
        </Text>

        <Pressable
          onPress={handleGetStarted}
          accessibilityRole="button"
          accessibilityLabel={t('landing.cta')}
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {t('landing.cta')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  subText: {
    ...typography.body,
    textAlign: 'left',
    color: SUBTEXT_COLOR,
  },
  cta: {
    marginTop: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    ...typography.button,
    color: colors.primary,
    fontWeight: '600',
  },
});
