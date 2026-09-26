import { Image, StyleSheet, Text, View } from 'react-native';

import { shade } from '../utils/color';

export default function ContactAvatar({ name, photo, color, size = 52 }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (photo) {
    return (
      <Image
        source={typeof photo === 'string' ? { uri: photo } : photo}
        style={[styles.image, shape]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        shape,
        {
          backgroundColor: color,
          experimental_backgroundImage: `linear-gradient(160deg, ${shade(color, 0.2)} 0%, ${color} 100%)`,
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#E6E6E6',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
