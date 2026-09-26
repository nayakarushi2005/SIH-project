// The browser gives coordinates but has no geocoder of its own, so they are
// turned into a city + PIN with OpenStreetMap's Nominatim (free, no API key;
// fine for occasional one-off lookups like this). Set VITE_REVERSE_URL to
// point at another Nominatim-compatible server when deploying.
const REVERSE_URL = import.meta.env.VITE_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse';

export class LocationError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'unsupported' | 'denied' | 'unavailable' | 'lookup_failed'
  }
}

export const LOCATION_MESSAGES = {
  unsupported: 'This browser cannot share location here (it needs HTTPS or localhost). Type the city and PIN instead.',
  denied: 'Location permission was blocked. Allow it in the browser, or type the city and PIN.',
  unavailable: 'Could not find your position. Try again, or type the city and PIN.',
  lookup_failed: 'Could not look up the address for your position. Type the city and PIN.',
};

function currentPosition() {
  if (!window.isSecureContext || !navigator.geolocation) {
    return Promise.reject(new LocationError('unsupported'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new LocationError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/**
 * Asks for the browser's position and returns { city, pincode } — either may
 * be '' when the map has no value for it, so the user fills the gap by hand.
 */
export async function detectCityPin() {
  const { latitude, longitude } = await currentPosition();

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  });
  let address;
  try {
    const res = await fetch(`${REVERSE_URL}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    address = (await res.json()).address;
  } catch {
    throw new LocationError('lookup_failed');
  }
  if (!address) throw new LocationError('lookup_failed');

  const city = address.city || address.town || address.village || address.state_district || address.county || '';
  const pincode = String(address.postcode || '').replace(/\s/g, '');
  return { city, pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : '' };
}
