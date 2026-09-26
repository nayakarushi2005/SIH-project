import { Image, Text, View } from 'react-native';

import { makeStyles } from '../hooks/useTheme';
import { initialsOf } from '../utils/profile';

export default function Avatar({ user, size = 40 }) {
  const styles = useStyles();
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

const useStyles = makeStyles((colors) => ({
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
}));
