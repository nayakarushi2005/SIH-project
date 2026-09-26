import * as Location from 'expo-location';

export class LocationError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'denied' | 'services_off' | 'unavailable'
  }
}

export async function locationPermissionStatus() {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/**
 * Asks for permission if needed, reads the phone's position and turns it
 * into a city + PIN with the phone's own geocoder (free, no API key).
 */
export async function detectLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationError('denied');
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationError('services_off');

  let position;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    position = await Location.getLastKnownPositionAsync();
  }
  if (!position) throw new LocationError('unavailable');

  const { latitude: lat, longitude: lng } = position.coords;
  let place = {};
  try {
    [place = {}] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  } catch {
    // Geocoder unavailable — the user types city/PIN on the confirm sheet.
  }
  return {
    lat,
    lng,
    city: place.city || place.subregion || place.district || '',
    pincode: /^[1-9]\d{5}$/.test(place.postalCode || '') ? place.postalCode : '',
    area: place.district || place.name || '',
  };
}

/**
 * The device's current position as { lat, lng }, for worker-mode location
 * updates — no geocoding. Throws an Error with a message fit for an Alert
 * when it can't.
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
