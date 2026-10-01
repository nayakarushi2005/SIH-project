import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors } from '../constants/theme';

/**
 * "Looking for work?" — asks signed-in users whether to register as a
 * worker. Same card as the DigiLocker screen (aadhaar-verify.js).
 */
export default function WorkerPrompt({ visible, busy, onRegister, onNotWorker, onClose }) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('worker.promptClose')}
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          <View style={styles.badge}>
            <Feather name="briefcase" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('worker.promptTitle')}
          </Text>
          <Text style={styles.body}>{t('worker.promptBody')}</Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={onRegister}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t('worker.promptRegister')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.6 }]}
            onPress={onNotWorker}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : (
              <Text style={styles.secondaryButtonText}>{t('worker.promptNotWorker')}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 24,
    paddingTop: 32,
  },
  close: { position: 'absolute', top: 14, right: 14 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#097D4C',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  secondaryButton: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, marginTop: 8, minHeight: 44, justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  pressed: { opacity: 0.88 },
});
