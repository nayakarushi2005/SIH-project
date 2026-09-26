import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../constants/theme';

export default function Notifications() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('notifications.title')} />
      <EmptyState
        icon="notifications-outline"
        title={t('notifications.emptyTitle')}
        body={t('notifications.emptyBody')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
