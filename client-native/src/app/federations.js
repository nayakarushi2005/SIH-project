import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from '../components/Button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import FederationList, { STATUS_KEYS } from '../components/FederationList';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useUser } from '../context/UserContext';
import { getNearbyFederations, leaveFederation, requestFederation } from '../services/api';

const serverMessage = (err) => err?.response?.data?.error;

/** Worker's federation: nearby list with join / cancel / leave. */
export default function Federations() {
  const { t } = useTranslation();
  const { user, setUser } = useUser();
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

  // The worker's active membership, even when it no longer appears nearby
  // (federation moved, lost verification, or the worker changed PIN) — so
  // it can always be cancelled or left.
  const current = user?.federation;
  const currentActive = current && (current.status === 'pending' || current.status === 'verified');
  const listed = currentActive && state.federations.some((f) => f.id === current.id);
  const showCurrent = currentActive && !state.loading && !listed;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScreenHeader title={t('federation.manageTitle')} fallbackHref="/profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('federation.stepBody')}</Text>
        {showCurrent ? (
          <View style={styles.current}>
            <Text style={styles.currentLabel}>{t('federation.current')}</Text>
            <Text style={styles.currentName}>
              {current.name ?? t('federation.unlisted')} · {t(STATUS_KEYS[current.status])}
            </Text>
            {current.name ? <Text style={styles.currentHint}>{t('federation.unlisted')}</Text> : null}
            {busyId === current.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : current.status === 'pending' ? (
              <Button label={t('federation.cancel')} variant="secondary" onPress={() => cancel(current)} />
            ) : (
              <Button label={t('federation.leave')} variant="danger" onPress={() => leave(current)} />
            )}
          </View>
        ) : null}
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
            blocked={showCurrent}
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
  current: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  currentLabel: { ...typography.label, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  currentName: { ...typography.body, fontWeight: '700', color: colors.text },
  currentHint: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
});
