import * as Location from 'expo-location';

/**
 * The device's current position as { lat, lng }, asking for permission if
 * needed. Throws an Error with a message fit for an Alert when it can't.
 */
export async function getCurrentCoords() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow location access so we can send you jobs nearby.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on location services on your phone.');
  }
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { lat: coords.latitude, lng: coords.longitude };
}
