import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../constants/theme';

const WORDMARK_SIZE = 46;

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.wordmark} numberOfLines={1} allowFontScaling={false}>
        sahayak
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  wordmark: {
    width: '100%',
    textAlign: 'center',
    fontFamily: fonts.brand,
    fontSize: WORDMARK_SIZE,
    lineHeight: 60,
    letterSpacing: WORDMARK_SIZE * -0.05,
    includeFontPadding: false,
    color: colors.textOnPrimary,
  },
});
