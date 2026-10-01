import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '../constants/theme';
import { LANGUAGES } from '../utils/profile';

export default function LanguagePrompt({ onConfirm, onSkip }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [original] = useState(i18n.language);
  const [selected, setSelected] = useState(i18n.language);
  const [busy, setBusy] = useState(false);

  const choose = (code) => {
    setSelected(code);
    i18n.changeLanguage(code);
  };

  const skip = () => {
    i18n.changeLanguage(original);
    onSkip();
  };

  const handleContinue = async () => {
    setBusy(true);
    try {
      await onConfirm(selected);
    } catch {
      Alert.alert(t('common.error'), t('language.saveFailed'), [
        { text: t('common.cancel'), style: 'cancel', onPress: skip },
        { text: t('common.tryAgain'), onPress: handleContinue },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            {t('language.chooseTitle')}
          </Text>
          <Text style={styles.body}>{t('language.chooseBody')}</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {LANGUAGES.map((lang) => {
              const isSelected = lang.value === selected;
              return (
                <Pressable
                  key={lang.value}
                  onPress={() => choose(lang.value)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.row,
                    isSelected && styles.rowSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.label, isSelected && styles.labelSelected]}>{lang.label}</Text>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={handleContinue}
            disabled={busy}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.ctaText}>{t('language.continue')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
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
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  body: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  label: { fontSize: 16, color: colors.text },
  labelSelected: { fontWeight: '700', color: colors.primary },
  cta: {
    marginTop: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },
  pressed: { opacity: 0.85 },
});
