import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import Button from '../components/Button';
import PickerSheet from '../components/PickerSheet';
import ScreenHeader from '../components/ScreenHeader';
import SelectField from '../components/SelectField';
import TextField from '../components/TextField';
import { radius, spacing, typography } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/useTheme';
import { MOST_BOOKED, getService } from '../constants/services';
import { addPostedJob } from '../services/jobStore';

const DAYS_AHEAD = 14;
const SLOT_MINUTES = 30;
const FIRST_SLOT = 6 * 60;
const LAST_SLOT = 22 * 60;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const CATEGORY_OPTIONS = MOST_BOOKED.map((s) => ({
  value: s.id,
  label: s.label,
  icon: s.icon,
  color: s.color,
}));

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDateOptions() {
  const today = startOfDay(new Date());
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const full = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
    const label = i === 0 ? `Today, ${full}` : i === 1 ? `Tomorrow, ${full}` : full;
    return { value: dateKey(d), label };
  });
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeSlots(from, to) {
  const slots = [];
  for (let t = from; t <= to; t += SLOT_MINUTES) slots.push({ value: t, label: formatTime(t) });
  return slots;
}

function earliestSlotToday() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.ceil((minutes + 1) / SLOT_MINUTES) * SLOT_MINUTES;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: null,
  date: null,
  startTime: null,
  endTime: null,
  price: '',
  image: null,
};

export default function CreateJob() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { service: serviceParam, title: titleParam } = useLocalSearchParams();

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    title: typeof titleParam === 'string' ? titleParam : '',
    category: CATEGORY_OPTIONS.some((o) => o.value === serviceParam) ? serviceParam : null,
  }));
  const [errors, setErrors] = useState({});
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const dateOptions = useMemo(() => buildDateOptions(), []);
  const isToday = form.date === dateOptions[0].value;

  const startOptions = useMemo(
    () => timeSlots(isToday ? Math.max(FIRST_SLOT, earliestSlotToday()) : FIRST_SLOT, LAST_SLOT - SLOT_MINUTES),
    [isToday]
  );
  const endOptions = useMemo(
    () => timeSlots((form.startTime ?? FIRST_SLOT) + SLOT_MINUTES, LAST_SLOT),
    [form.startTime]
  );

  const selectDate = useCallback(
    (value) => {
      setField('date', value);
      if (value === dateOptions[0].value && form.startTime != null && form.startTime < earliestSlotToday()) {
        setForm((f) => ({ ...f, startTime: null, endTime: null }));
      }
    },
    [dateOptions, form.startTime, setField]
  );

  const selectStart = useCallback(
    (value) => {
      setField('startTime', value);
      if (form.endTime != null && form.endTime <= value) setForm((f) => ({ ...f, endTime: null }));
    },
    [form.endTime, setField]
  );

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      Alert.alert('Image too large', 'Please choose an image smaller than 20 MB.');
      return;
    }
    setField('image', asset.uri);
  }, [setField]);

  const handleSubmit = useCallback(async () => {
    const title = form.title.trim();
    const price = Number(form.price);
    const next = {};
    if (!title) next.title = 'Add a title for your job';
    if (!form.category) next.category = 'Choose a category';
    if (!form.date) next.date = 'Choose a date';
    if (form.startTime == null) next.startTime = 'Choose a start time';
    if (!form.price || !Number.isFinite(price) || price <= 0) next.price = 'Enter your budget in rupees';

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      await addPostedJob({
        id: `job-${Date.now()}`,
        serviceId: form.category,
        title,
        description: form.description.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        price,
        image: form.image,
        status: 'posted',
      });
      router.back();
    } catch {
      Alert.alert('Could not post job', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form, router]);

  const category = getService(form.category);
  const dateLabel = dateOptions.find((d) => d.value === form.date)?.label;
  const timeError = errors.startTime;

  const sheets = {
    category: { title: 'Category', options: CATEGORY_OPTIONS, value: form.category, onSelect: (v) => setField('category', v) },
    date: { title: 'Date', options: dateOptions, value: form.date, onSelect: selectDate },
    startTime: { title: 'Start time', options: startOptions, value: form.startTime, onSelect: selectStart },
    endTime: { title: 'End time', options: endOptions, value: form.endTime, onSelect: (v) => setField('endTime', v) },
  };
  const activeSheet = sheet ? sheets[sheet] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="Post a job" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading} accessibilityRole="header">
            Fill the information
          </Text>

          <TextField
            label="Title"
            placeholder="e.g. Fix ceiling fan wiring"
            value={form.title}
            onChangeText={(v) => setField('title', v)}
            error={errors.title}
            maxLength={80}
            suffix={
              form.title.trim() ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              ) : null
            }
          />

          <TextField
            label="Description"
            placeholder="Add description here..."
            value={form.description}
            onChangeText={(v) => setField('description', v)}
            multiline
            maxLength={500}
            style={styles.description}
          />

          <SelectField
            label="Category"
            placeholder="Choose a category"
            value={category?.label}
            icon={category?.icon}
            iconColor={category?.color}
            onPress={() => setSheet('category')}
            error={errors.category}
          />

          <SelectField
            label="Date & time"
            placeholder="Choose a date"
            value={dateLabel}
            onPress={() => setSheet('date')}
            error={errors.date}
            style={styles.dateField}
          />
          <View style={styles.timeRow}>
            <SelectField
              placeholder="Start"
              value={form.startTime != null ? formatTime(form.startTime) : null}
              leadingIcon="time-outline"
              chevron={false}
              onPress={() => setSheet('startTime')}
              error={timeError ? ' ' : null}
              style={styles.timeField}
            />
            <View style={styles.timeDash}>
              <Ionicons name="remove" size={20} color={colors.text} />
            </View>
            <SelectField
              placeholder="End"
              value={form.endTime != null ? formatTime(form.endTime) : null}
              leadingIcon="time-outline"
              chevron={false}
              onPress={() => setSheet('endTime')}
              style={styles.timeField}
            />
          </View>
          {timeError ? <Text style={styles.error}>{timeError}</Text> : null}

          <TextField
            label="Budget"
            prefix="₹"
            placeholder="0"
            value={form.price}
            onChangeText={(v) => setField('price', v.replace(/\D/g, '').slice(0, 7))}
            error={errors.price}
            keyboardType="number-pad"
            style={styles.budget}
          />

          <Text style={styles.heading} accessibilityRole="header">
            Upload cover image
          </Text>
          <View style={styles.upload}>
            {form.image ? (
              <Image source={{ uri: form.image }} style={styles.preview} accessibilityLabel="Cover image" />
            ) : (
              <View style={styles.uploadEmpty}>
                <Text style={styles.uploadText}>
                  Add a photo of the work or{' '}
                  <Text style={styles.uploadLink} onPress={pickImage}>
                    browse
                  </Text>
                </Text>
                <Text style={styles.uploadHint}>Max. file size: 20 MB</Text>
              </View>
            )}
            <View style={styles.uploadActions}>
              <Pressable
                onPress={pickImage}
                style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
                <Text style={styles.uploadButtonText}>{form.image ? 'Change image' : 'Upload image'}</Text>
              </Pressable>
              {form.image ? (
                <Pressable
                  onPress={() => setField('image', null)}
                  style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <Text style={[styles.uploadButtonText, styles.deleteText]}>Delete image</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={styles.footerButton} />
          <Button label="Save and post" onPress={handleSubmit} loading={saving} style={styles.footerButton} />
        </View>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={!!activeSheet}
        title={activeSheet?.title}
        options={activeSheet?.options ?? []}
        value={activeSheet?.value}
        onSelect={(v) => activeSheet?.onSelect(v)}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
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
  heading: {
    ...typography.title,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  description: {
    marginBottom: spacing.md,
  },
  dateField: {
    marginBottom: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  timeField: {
    flex: 1,
    marginBottom: 0,
  },
  timeDash: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  budget: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  upload: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  uploadEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  uploadText: {
    ...typography.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  uploadLink: {
    fontWeight: '700',
    color: colors.primary,
  },
  uploadHint: {
    ...typography.label,
    color: colors.textMuted,
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  uploadActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  uploadButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  deleteText: {
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg - spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerButton: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
}));
