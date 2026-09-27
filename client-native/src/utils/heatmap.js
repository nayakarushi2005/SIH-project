import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

import i18n from '../i18n';
import { localeTag } from '../i18n/language';
import { formatDistance } from './job';

/**
 * Whether this build can draw Google Maps: it needs an API key baked in
 * (app.config.js), and the heatmap layer is set up for Android only.
 */
export const canShowMap = Platform.OS === 'android' && !!Constants.expoConfig?.extra?.googleMapsConfigured;

/**
 * The phone's position without prompting — for cards on home screens. Null
 * if location permission hasn't been given yet.
 */
export async function quietCoords() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

const toRad = (d) => (d * Math.PI) / 180;
const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Metres and compass direction (i18n key) from `from` to `to`. */
function distanceAndDirection(from, to) {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * 6371000 * Math.asin(Math.sqrt(a));
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { meters, direction: DIRECTIONS[Math.round(bearing / 45) % 8] };
}

/** "1.2 km north-east" for an area, as seen from `from`. */
export function describePlace(from, cell) {
  const { meters, direction } = distanceAndDirection(from, cell);
  if (meters < 300) return i18n.t('heatmap.nearYou');
  return i18n.t('heatmap.placeFrom', { distance: formatDistance(meters), direction: i18n.t(`heatmap.dir.${direction}`) });
}

/** "6 pm – 9 pm" for a 3-hour stretch starting at `hour` (0–23). */
export function formatHourRange(hour) {
  const fmt = (h) => {
    const d = new Date(2000, 0, 1, h % 24);
    return d.toLocaleTimeString(localeTag(), { hour: 'numeric' });
  };
  return `${fmt(hour)} – ${fmt(hour + 3)}`;
}
