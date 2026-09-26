import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

/**
 * The device's current position, fetched once on mount.
 * status: 'loading' | 'ready' | 'denied' | 'off' | 'error'
 * coords: { lat, lng } when ready; label: a short place name once
 * reverse-geocoding finishes (may stay null). `canAskAgain` is false when the
 * user has to enable the permission from system settings.
 */
export default function useCurrentLocation() {
  const [state, setState] = useState({ status: 'loading', coords: null, label: null });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const update = (next) => {
      if (id === requestId.current) setState(next);
    };

    update({ status: 'loading', coords: null, label: null });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        update({ status: 'denied', coords: null, label: null, canAskAgain: permission.canAskAgain });
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        update({ status: 'off', coords: null, label: null });
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = { lat: coords.latitude, lng: coords.longitude };
      update({ status: 'ready', coords: point, label: null });

      // Nice-to-have only — the job posts fine without a readable name.
      const [place] = await Location.reverseGeocodeAsync(coords).catch(() => []);
      if (place) {
        const parts = [place.name, place.district || place.subregion, place.city];
        const label = [...new Set(parts.filter(Boolean))].join(', ');
        update({ status: 'ready', coords: point, label: label || null });
      }
    } catch {
      update({ status: 'error', coords: null, label: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
