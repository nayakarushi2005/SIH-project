import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';
import { getToken } from '../services/session';

const subjectImage = require('../../assets/images/subject.webp');
const { width: subjectW, height: subjectH } =
  Image.resolveAssetSource(subjectImage);
const SUBJECT_ASPECT_RATIO = subjectW / subjectH;

const BRAND_WORD = 'NAME';

const MAX_FONT_SCALE = 1.4;

export default function Landing() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [sessionRoute, setSessionRoute] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let route = false;
      try {
        if (await getToken()) route = '/home';
      } catch {
      }
      if (!cancelled) setSessionRoute(route);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const brandWordSize = Math.min(width * 0.34, 180);

  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    router.replace('/auth');
  }, [router]);

  if (sessionRoute) return <Redirect href={sessionRoute} />;

  if (sessionRoute === null) {
    return (
      <View style={styles.checking}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      <View style={styles.hero}>
        <Text
          style={[
            styles.brandWord,
            { fontSize: brandWordSize, lineHeight: brandWordSize * 1.1 },
          ]}
          numberOfLines={1}
          allowFontScaling={false}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {BRAND_WORD}
        </Text>
        <Image
          source={subjectImage}
          style={styles.subject}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      </View>

      <View style={styles.copy}>
        <Text
          style={styles.heading}
          accessibilityRole="header"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          <Text style={styles.headingBold}>Every Skill,</Text>
          {'\n'}One <Text style={styles.headingBold}>App</Text>
        </Text>
        <Text style={styles.subText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          From quick fixes to big projects, find verified local professionals
          ready to help.
        </Text>
      </View>

      <Pressable
        onPress={handleGetStarted}
        accessibilityRole="button"
        accessibilityLabel="Get started"
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <View style={styles.ctaButton}>
          <Text style={styles.ctaText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Get Started
          </Text>
        </View>
        <View style={styles.arrow} />
      </Pressable>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  checking: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingBottom: spacing.md,
  },
  hero: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWord: {
    position: 'absolute',
    top: '28%',
    width: '100%',
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 4,
    color: colors.decorative,
  },
  subject: {
    height: '100%',
    maxWidth: '100%',
    aspectRatio: SUBJECT_ASPECT_RATIO,
  },
  copy: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  heading: {
    ...typography.heading,
    fontWeight: '400',
    color: colors.text,
  },
  headingBold: {
    fontWeight: '800',
  },
  subText: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.text,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 5,
    paddingRight: 18,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  ctaText: {
    ...typography.button,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  arrow: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
  },
}));
