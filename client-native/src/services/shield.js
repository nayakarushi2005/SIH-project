import { DeviceEventEmitter, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import i18n from '../i18n';
import { closeShield, isUnauthorized, raiseSos, sendShieldLocation } from './api';

/**
 * The safety shield outside any one screen: the background location task,
 * the sticky notification with its SOS / Call / Close buttons, and the
 * events that keep the shield screen in step with both.
 *
 * Positions come from ONE source at a time — this background task when the
 * user allowed location "all the time", otherwise the screen's own watcher —
 * and both go through reportLocation(). The server decides everything else.
 *
 * This module must be imported at the top of the root layout: the task has
 * to be defined before any React code runs, because Android can start the
 * JS runtime just to run it.
 */

export const EMERGENCY_NUMBER = '112';
export const SHIELD_TASK = 'safety-shield-location';
export const SHIELD_STATUS_EVENT = 'safety-shield:status';
export const SHIELD_CLOSED_EVENT = 'safety-shield:closed';

const NOTIFICATION_ID = 'safety-shield';
const NOTIFICATION_TYPE = 'safety-shield';
const CHANNEL_ID = 'safety-shield';
const CATEGORY_IDLE = 'safety-shield';
const CATEGORY_SOS = 'safety-shield-sos';
const ACTIONS = { sos: 'SHIELD_SOS', call: 'SHIELD_CALL', close: 'SHIELD_CLOSE' };

// Don't post more often than this unless the user moved further.
const MIN_REPORT_GAP_MS = 3000;
const MIN_REPORT_MOVE_M = 3;

let lastReport = null; // { lat, lng, at }
let notificationSos = null; // SOS state the notification shows; null = not shown

function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const toPoint = (coords) => ({ lat: coords.latitude, lng: coords.longitude });

/** Hands a fresh status to the screen and keeps the notification's SOS state right. */
export function publishStatus(status) {
  if (!status) return;
  DeviceEventEmitter.emit(SHIELD_STATUS_EVENT, status);
  const sos = !!status.sos;
  if (notificationSos !== null && notificationSos !== sos) {
    showShieldNotification(sos).catch(() => {});
  }
}

/** Sends a position (throttled) and publishes the status it returns. */
export async function reportLocation(coords, { force = false } = {}) {
  const point = toPoint(coords);
  const now = Date.now();
  if (
    !force &&
    lastReport &&
    now - lastReport.at < MIN_REPORT_GAP_MS &&
    distanceM(lastReport, point) < MIN_REPORT_MOVE_M
  ) {
    return null;
  }
  lastReport = { ...point, at: now };
  const status = await sendShieldLocation(point);
  publishStatus(status);
  return status;
}

TaskManager.defineTask(SHIELD_TASK, async ({ data, error }) => {
  const locations = data?.locations;
  if (error || !locations?.length) return;
  if (notificationSos === null) notificationSos = false; // headless start: notification is up
  try {
    await reportLocation(locations[locations.length - 1].coords);
  } catch (err) {
    if (isUnauthorized(err)) await stopShieldServices();
  }
});

// ── Background location ─────────────────────────────────────────────────────

/**
 * Asks for "all the time" location. False → the screen reports positions
 * itself. Never throws: a refused or unavailable background permission (e.g.
 * a build without it in the manifest) must not keep the shield from opening.
 */
export async function requestBackgroundLocation() {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return false;
    const background = await Location.requestBackgroundPermissionsAsync();
    return background.granted;
  } catch {
    return false;
  }
}

export async function startBackgroundLocation() {
  if (await Location.hasStartedLocationUpdatesAsync(SHIELD_TASK)) return;
  await Location.startLocationUpdatesAsync(SHIELD_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 3,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: i18n.t('shield.service.title'),
      notificationBody: i18n.t('shield.service.body'),
      notificationColor: '#B42318',
      killServiceOnDestroy: false,
    },
  });
}

async function stopBackgroundLocation() {
  const started = await Location.hasStartedLocationUpdatesAsync(SHIELD_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(SHIELD_TASK);
}

// ── Notification ────────────────────────────────────────────────────────────

/**
 * Registers the notification channel and buttons. Safe to call again (e.g.
 * after a language change, so the buttons are in the new language).
 */
export async function setupShieldNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // The screen already shows the shield; don't pop a banner over it.
      const shield = notification.request.content.data?.type === NOTIFICATION_TYPE;
      return { shouldShowBanner: !shield, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('shield.notification.channel'),
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // Android shows at most three buttons. Recording starts by itself with an
  // SOS, and turning an SOS off is only done in the app.
  const call = {
    identifier: ACTIONS.call,
    buttonTitle: i18n.t('shield.notification.call', { number: EMERGENCY_NUMBER }),
    options: { opensAppToForeground: true },
  };
  await Notifications.setNotificationCategoryAsync(CATEGORY_IDLE, [
    { identifier: ACTIONS.sos, buttonTitle: i18n.t('shield.notification.sos'), options: { opensAppToForeground: true } },
    call,
    {
      identifier: ACTIONS.close,
      buttonTitle: i18n.t('shield.notification.close'),
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(CATEGORY_SOS, [call]);
}

export async function showShieldNotification(sos) {
  notificationSos = sos;
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: i18n.t('shield.notification.title'),
      body: i18n.t(sos ? 'shield.notification.bodySos' : 'shield.notification.body'),
      sticky: true,
      autoDismiss: false,
      categoryIdentifier: sos ? CATEGORY_SOS : CATEGORY_IDLE,
      data: { type: NOTIFICATION_TYPE },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

// ── Starting and stopping ───────────────────────────────────────────────────

/**
 * Notification (and background location when allowed) for an opened shield.
 * Returns true if background location is running; false means the screen
 * must report positions itself.
 */
export async function startShieldServices({ background, sos }) {
  await Notifications.requestPermissionsAsync().catch(() => null);
  await setupShieldNotifications().catch(() => {});
  await showShieldNotification(sos).catch(() => {});
  if (!background) return false;
  try {
    await startBackgroundLocation();
    return true;
  } catch {
    return false;
  }
}

export async function stopShieldServices() {
  notificationSos = null;
  lastReport = null;
  await stopBackgroundLocation().catch(() => {});
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
}

export function callEmergency() {
  return Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => {});
}

/**
 * Carries out a tap on the shield notification. Returns true when the
 * shield screen should be shown.
 */
export async function handleShieldNotification(response) {
  if (response?.notification?.request?.content?.data?.type !== NOTIFICATION_TYPE) return false;

  switch (response.actionIdentifier) {
    case ACTIONS.sos: {
      try {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        publishStatus(
          await raiseSos({ location: last ? toPoint(last.coords) : undefined, trigger: 'notification' })
        );
      } catch {
        // The screen opens either way; its SOS button retries.
      }
      return true;
    }
    case ACTIONS.call:
      await callEmergency();
      return false;
    case ACTIONS.close:
      await closeShield().catch(() => {});
      await stopShieldServices();
      DeviceEventEmitter.emit(SHIELD_CLOSED_EVENT);
      return false;
    default:
      return true; // tapped the notification itself
  }
}
