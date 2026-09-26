import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Button from '../components/Button';
import OptionGroup from '../components/OptionGroup';
import PhotoPicker from '../components/PhotoPicker';
import ScreenHeader from '../components/ScreenHeader';
import TextField from '../components/TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getService, SERVICES } from '../constants/services';
import useCurrentLocation from '../hooks/useCurrentLocation';
import { createJob, getErrorMessage, getFieldErrors, uploadJobPhoto } from '../services/api';
import { getUser } from '../services/session';
import { DURATIONS, MAX_PHOTOS } from '../utils/job';

const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label }));

const LOCATION_MESSAGES = {
  denied: 'Location permission is off. Nearby workers can’t see your job without it.',
  off: 'Location services are turned off on your phone.',
  error: 'We couldn’t get your location.',
};

function LocationCard({ location, error }) {
  const { status, label, canAskAgain, refresh } = location;
  const openSettings = status === 'denied' && canAskAgain === false;

  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>Job location</Text>
      <View style={[styles.locationCard, error && styles.locationCardError]}>
        <Ionicons
          name={status === 'ready' ? 'location-sharp' : 'location-outline'}
          size={20}
          color={status === 'ready' ? colors.primary : colors.textMuted}
        />
        <View style={styles.locationBody}>
          {status === 'loading' ? (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.locationMuted}>Finding your location…</Text>
            </View>
          ) : status === 'ready' ? (
            <>
              <Text style={styles.locationTitle}>Current location</Text>
              <Text style={styles.locationMuted} numberOfLines={2}>
                {label || 'Pinned from your phone’s GPS'}
              </Text>
            </>
          ) : (
            <Text style={styles.locationMuted}>{LOCATION_MESSAGES[status]}</Text>
          )}
        </View>
        {status !== 'loading' ? (
          <Pressable
            onPress={openSettings ? () => Linking.openSettings() : refresh}
            hitSlop={spacing.sm}
            accessibilityRole="button"
          >
            <Text style={styles.locationAction}>
              {openSettings ? 'Settings' : status === 'ready' ? 'Refresh' : 'Try again'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : (
        <Text style={styles.fieldHint}>We use this to find workers near the job.</Text>
      )}
    </View>
  );
}

export default function CreateJob() {
  const router = useRouter();
  const { service: serviceId } = useLocalSearchParams();
  const location = useCurrentLocation();

  const [form, setForm] = useState({
    category: getService(serviceId)?.id ?? '',
    description: '',
    price: '',
    expectedDurationMins: null,
    address: '',
  });
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [posting, setPosting] = useState(false);
  const [aadhaarVerified, setAadhaarVerified] = useState(true);
  const nextPhotoKey = useRef(0);

  useEffect(() => {
    getUser().then((user) => setAadhaarVerified(!!user?.isAadhaarVerified));
  }, []);

  const clearError = useCallback((field) => {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const setField = useCallback(
    (field, value) => {
      setForm((f) => ({ ...f, [field]: value }));
      clearError(field);
    },
    [clearError]
  );

  // ── Photos: each one uploads as soon as it's picked ─────────────────────
  const updatePhoto = useCallback((key, changes) => {
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }, []);

  const upload = useCallback(
    async (photo) => {
      updatePhoto(photo.key, { status: 'uploading' });
      try {
        const url = await uploadJobPhoto(photo);
        updatePhoto(photo.key, { status: 'done', url });
      } catch (err) {
        console.warn('Job photo upload failed:', getErrorMessage(err));
        updatePhoto(photo.key, { status: 'error' });
      }
    },
    [updatePhoto]
  );

  const addPhotos = useCallback(
    (assets) => {
      const added = assets.map((asset) => ({
        key: String(nextPhotoKey.current++),
        uri: asset.uri,
        status: 'uploading',
        url: null,
      }));
      setPhotos((list) => [...list, ...added]);
      clearError('photos');
      added.forEach(upload);
    },
    [clearError, upload]
  );

  const removePhoto = useCallback((key) => {
    setPhotos((list) => list.filter((p) => p.key !== key));
  }, []);

  const retryPhoto = useCallback(
    (key) => {
      const photo = photos.find((p) => p.key === key);
      if (photo) upload(photo);
    },
    [photos, upload]
  );

  // ── Submit ──────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    // Only what the server can't check for us; everything else comes back
    // as field errors from the API.
    const local = {};
    if (photos.some((p) => p.status === 'uploading')) {
      local.photos = 'Wait for your photos to finish uploading.';
    } else if (photos.some((p) => p.status === 'error')) {
      local.photos = 'A photo failed to upload. Tap it to retry, or remove it.';
    }
    if (location.status !== 'ready') {
      local.location = 'We need your location to find workers nearby.';
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setPosting(true);
    try {
      await createJob({
        category: form.category,
        description: form.description,
        photos: photos.map((p) => p.url),
        price: form.price,
        expectedDurationMins: form.expectedDurationMins,
        location: location.coords,
        address: form.address,
      });
      Alert.alert('Job posted', 'We’re finding workers near you. You’ll see updates in Bookings.');
      router.navigate('/bookings');
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        Alert.alert('Could not post job', getErrorMessage(err));
      }
    } finally {
      setPosting(false);
    }
  }, [form, location, photos, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title="New job" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!aadhaarVerified ? (
            <Pressable
              onPress={() => router.push('/aadhaar-verify')}
              style={styles.notice}
              accessibilityRole="button"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
              <Text style={styles.noticeText}>
                Workers respond faster to verified clients.{' '}
                <Text style={styles.noticeLink}>Verify with DigiLocker</Text>
              </Text>
            </Pressable>
          ) : null}

          {/* ── The work ───────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>The work</Text>
          <OptionGroup
            label="Service"
            options={SERVICE_OPTIONS}
            value={form.category}
            onChange={(v) => setField('category', v)}
            error={errors.category}
          />
          <PhotoPicker
            label="Photos of the work"
            photos={photos}
            max={MAX_PHOTOS}
            onAdd={addPhotos}
            onRemove={removePhoto}
            onRetry={retryPhoto}
            error={errors.photos}
            hint={`Add up to ${MAX_PHOTOS}. Clear photos get better quotes.`}
          />
          <TextField
            label="What needs to be done?"
            placeholder="e.g. Kitchen sink is leaking from the pipe underneath"
            value={form.description}
            onChangeText={(v) => setField('description', v)}
            error={errors.description}
            multiline
            maxLength={500}
          />

          {/* ── Budget & time ──────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Budget & time</Text>
          <TextField
            label="Your price"
            prefix="₹"
            placeholder="500"
            value={form.price}
            onChangeText={(v) => setField('price', v.replace(/\D/g, '').slice(0, 6))}
            error={errors.price}
            hint="What you’ll pay for the whole job."
            keyboardType="number-pad"
            maxLength={6}
          />
          <OptionGroup
            label="How long will it take?"
            options={DURATIONS}
            value={form.expectedDurationMins}
            onChange={(v) => setField('expectedDurationMins', v)}
            error={errors.expectedDurationMins}
          />

          {/* ── Where ──────────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Where</Text>
          <LocationCard
            location={location}
            error={location.status === 'ready' ? undefined : errors.location}
          />
          <TextField
            label="House no. / landmark (optional)"
            placeholder="e.g. Flat 302, near City Hospital"
            value={form.address}
            onChangeText={(v) => setField('address', v)}
            error={errors.address}
            hint="Helps the worker find you."
            autoComplete="street-address"
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Post job" onPress={handlePost} loading={posting} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg - spacing.xs,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sectionSpacing: {
    marginTop: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  noticeText: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  noticeLink: {
    fontWeight: '700',
    color: colors.warning,
  },
  fieldWrapper: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.label,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  fieldHint: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  fieldError: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 56,
    padding: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  locationCardError: {
    borderColor: colors.danger,
  },
  locationBody: {
    flex: 1,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  locationMuted: {
    ...typography.label,
    color: colors.textMuted,
  },
  locationAction: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
