import { useCallback } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius, spacing, typography } from '../constants/theme';

const TILE = 88;
const QUALITY = 0.6; // phone photos are several MB; this keeps uploads quick

/**
 * Row of photo thumbnails plus an "add" tile that offers camera or gallery.
 * photos: [{ key, uri, status: 'uploading' | 'done' | 'error' }]
 * onAdd receives the picked ImagePicker assets; tapping a failed photo calls
 * onRetry(key), the ✕ calls onRemove(key).
 */
export default function PhotoPicker({ label, photos, max, onAdd, onRemove, onRetry, error, hint }) {
  const remaining = max - photos.length;

  const pick = useCallback(
    async (source) => {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph the work.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: QUALITY });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: QUALITY,
        });
      }
      if (!result.canceled && result.assets?.length) {
        onAdd(result.assets.slice(0, remaining));
      }
    },
    [onAdd, remaining]
  );

  const chooseSource = useCallback(() => {
    Alert.alert('Add a photo', 'Show workers what needs to be done.', [
      { text: 'Take photo', onPress: () => pick('camera') },
      { text: 'Choose from gallery', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pick]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {photos.map((photo, i) => (
          <View key={photo.key} style={styles.tile}>
            <Pressable
              onPress={photo.status === 'error' ? () => onRetry(photo.key) : undefined}
              disabled={photo.status !== 'error'}
              accessibilityRole={photo.status === 'error' ? 'button' : 'image'}
              accessibilityLabel={
                photo.status === 'error'
                  ? `Photo ${i + 1} failed to upload. Retry`
                  : `Photo ${i + 1}${photo.status === 'uploading' ? ', uploading' : ''}`
              }
            >
              <Image source={{ uri: photo.uri }} style={styles.image} />
              {photo.status === 'uploading' ? (
                <View style={styles.overlay}>
                  <ActivityIndicator color={colors.textOnPrimary} />
                </View>
              ) : null}
              {photo.status === 'error' ? (
                <View style={[styles.overlay, styles.overlayError]}>
                  <Ionicons name="refresh" size={22} color={colors.textOnPrimary} />
                  <Text style={styles.overlayText}>Retry</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => onRemove(photo.key)}
              hitSlop={spacing.sm}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${i + 1}`}
            >
              <Ionicons name="close" size={14} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        ))}

        {remaining > 0 ? (
          <Pressable
            onPress={chooseSource}
            style={({ pressed }) => [styles.tile, styles.add, error && styles.addError, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
          >
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
            <Text style={styles.addText}>
              {photos.length === 0 ? 'Add photo' : `${photos.length}/${max}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: TILE,
    height: TILE,
  },
  image: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  overlayError: {
    backgroundColor: 'rgba(180, 35, 24, 0.75)',
  },
  overlayText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.textOnPrimary,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  addError: {
    borderColor: colors.danger,
  },
  addText: {
    ...typography.label,
    fontWeight: '600',
    color: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
