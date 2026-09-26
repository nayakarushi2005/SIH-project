import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import Button from './Button';
import TextField from './TextField';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { getFieldErrors, updateMe } from '../services/api';
import { detectLocation } from '../services/location';

const ERROR_KEYS = {
  denied: 'location.denied',
  services_off: 'location.servicesOff',
  unavailable: 'location.unavailable',
};

/**
 * Bottom sheet that reads the phone's location, shows the city and PIN it
 * found, and lets the user correct them before saving to the profile.
 * With `autoDetect` it starts detecting as soon as it opens.
 */
export default function LocationSheet({ visible, autoDetect = false, onClose, onSaved }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      {/* Mounted per opening, so every visit starts from the saved values. */}
      {visible ? <LocationForm autoDetect={autoDetect} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function LocationForm({ autoDetect, onClose, onSaved }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useUser();

  const [detecting, setDetecting] = useState(autoDetect);
  const [coords, setCoords] = useState(null);
  const [area, setArea] = useState('');
  const [message, setMessage] = useState(null);
  const [city, setCity] = useState(user?.city ?? '');
  const [pincode, setPincode] = useState(user?.pincode ?? '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const showFound = useCallback(
    (found) => {
      setCoords({ lat: found.lat, lng: found.lng });
      setArea(found.area);
      if (found.city) setCity(found.city);
      if (found.pincode) setPincode(found.pincode);
      setMessage(t('location.confirm'));
      setDetecting(false);
    },
    [t]
  );

  const showError = useCallback(
    (err) => {
      setMessage(t(ERROR_KEYS[err?.code] ?? 'location.unavailable'));
      setDetecting(false);
    },
    [t]
  );

  // Auto-detect once on open; ignore the answer if the sheet closed first.
  useEffect(() => {
    if (!autoDetect) return undefined;
    let open = true;
    detectLocation().then(
      (found) => open && showFound(found),
      (err) => open && showError(err)
    );
    return () => {
      open = false;
    };
  }, [autoDetect, showError, showFound]);

  const detect = useCallback(() => {
    setDetecting(true);
    setMessage(null);
    detectLocation().then(showFound, showError);
  }, [showError, showFound]);

  const save = useCallback(async () => {
    setSaving(true);
    setErrors({});
    try {
      const updated = await updateMe({
        city: city.trim(),
        pincode: pincode.trim(),
        ...(coords ? { location: coords } : {}),
      });
      setUser(updated);
      onSaved?.(updated);
      onClose();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else Alert.alert(t('common.error'), t('location.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [city, coords, onClose, onSaved, pincode, setUser, t]);

  return (
    <KeyboardAvoidingView behavior="padding">
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          {t('location.title')}
        </Text>

        {detecting ? (
          <View style={styles.detecting}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.message}>{t('location.detecting')}</Text>
          </View>
        ) : (
          <Button
            label={t('location.useCurrent')}
            variant="secondary"
            onPress={detect}
            style={styles.detectButton}
          />
        )}

        {area ? <Text style={styles.area}>📍 {area}</Text> : null}
        {message && !detecting ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.inline}>
          <TextField
            label={t('profile.city')}
            placeholder={t('editProfile.cityPlaceholder')}
            value={city}
            onChangeText={setCity}
            error={errors.city}
            autoCapitalize="words"
            style={styles.inlineWide}
          />
          <TextField
            label={t('profile.pincode')}
            placeholder="302001"
            value={pincode}
            onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
            error={errors.pincode}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.inlineNarrow}
          />
        </View>
        {errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}

        <Button
          label={t('location.save')}
          onPress={save}
          loading={saving}
          disabled={detecting || !city.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  detecting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, marginBottom: spacing.md },
  detectButton: { marginBottom: spacing.md },
  area: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  message: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md, flexShrink: 1 },
  inline: { flexDirection: 'row', gap: spacing.sm + 4 },
  inlineWide: { flex: 3 },
  inlineNarrow: { flex: 2 },
  error: { ...typography.label, color: colors.danger, marginBottom: spacing.sm },
});
