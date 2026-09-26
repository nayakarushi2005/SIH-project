import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/theme';
import { initialsOf } from '../utils/profile';

/** Round profile picture, falling back to the user's initials. */
export default function Avatar({ user, size = 40 }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (user?.googleAvatar) {
    return <Image source={{ uri: user.googleAvatar }} style={[styles.image, shape]} />;
  }

  return (
    <View style={[styles.fallback, shape]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsOf(user)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  initials: {
    fontWeight: '700',
    color: colors.primary,
  },
});
