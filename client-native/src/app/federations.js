import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import FederationList from '../components/FederationList';
import ScreenHeader from '../components/ScreenHeader';
import { colors, spacing, typography } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { getNearbyFederations, leaveFederation, requestFederation } from '../services/api';

const serverMessage = (err) => err?.response?.data?.error;

/** Worker's federation: nearby list with join / cancel / leave. */
export default function Federations() {
  const { t } = useTranslation();
  const { setUser } = useUser();
  const [state, setState] = useState({ loading: true, federations: [], message: null });
  const [busyId, setBusyId] = useState(null);

  const fetchList = useCallback(
    () =>
      getNearbyFederations().then(
        (data) => setState({ loading: false, federations: data.federations, message: data.federations.length ? null : t('federation.none') }),
        (err) =>
          setState({
            loading: false,
            federations: [],
            message: err?.response?.data?.code === 'no_location' ? t('federation.noLocation') : serverMessage(err) || t('common.error'),
          })
      ),
    [t]
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const run = useCallback(
    async (federation, action, failKey) => {
      setBusyId(federation.id);
      try {
        setUser(await action());
        await fetchList();
      } catch (err) {
        Alert.alert(t('common.error'), serverMessage(err) || t(failKey));
      } finally {
        setBusyId(null);
      }
    },
    [fetchList, setUser, t]
  );

  const join = (f) => run(f, () => requestFederation(f.id), 'federation.requestFailed');
  const leave = (f) =>
    Alert.alert(t('federation.leave'), t('federation.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('federation.leave'), style: 'destructive', onPress: () => run(f, leaveFederation, 'federation.leaveFailed') },
    ]);
  const cancel = (f) => run(f, leaveFederation, 'federation.leaveFailed');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('federation.manageTitle')} fallbackHref="/profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('federation.stepBody')}</Text>
        {state.loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : state.federations.length > 0 ? (
          <FederationList
            mode="manage"
            federations={state.federations}
            busyId={busyId}
            onJoin={join}
            onCancel={cancel}
            onLeave={leave}
          />
        ) : (
          <Text style={styles.message}>{state.message}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg - spacing.xs, gap: spacing.md },
  body: { ...typography.body, color: colors.textMuted },
  centered: { paddingVertical: spacing.xl, alignItems: 'center' },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
});
