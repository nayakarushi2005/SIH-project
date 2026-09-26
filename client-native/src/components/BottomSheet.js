import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '../constants/theme';
import { makeStyles } from '../hooks/useTheme';

export default function BottomSheet({ visible, onClose, tone = 'default', maxHeight = '85%', children }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const green = tone === 'green';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            green && styles.sheetGreen,
            { maxHeight, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={[styles.handle, green && styles.handleGreen]} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingTop: spacing.sm + 2,
  },
  sheetGreen: {
    backgroundColor: colors.primary,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  handleGreen: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
}));
