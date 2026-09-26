import {} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { makeStyles } from '../hooks/useTheme';

export default function Notifications() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="Notifications" />
      <EmptyState
        icon="notifications-outline"
        title="You're all caught up"
        body="Updates about your jobs, workers and payments will show up here."
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
}));
