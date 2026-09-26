import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, tabBar } from '../constants/theme';

export default function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return insets.bottom + tabBar.gap + tabBar.height + spacing.md;
}
