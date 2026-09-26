import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';

function formatAddress(address) {
  if (!address) return null;
  const area = address.district || address.subregion || address.name;
  const city = address.city || address.region;
  const parts = [area, city].filter(Boolean);
  return [...new Set(parts)].join(', ') || null;
}

export default function useDeviceLocation() {
  const [status, setStatus] = useState('loading');
  const [label, setLabel] = useState(null);
  const mounted = useRef(true);

  const locate = useCallback(async () => {
    setStatus('loading');
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        if (mounted.current) setStatus('off');
        return;
      }
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      if (!mounted.current) return;
      setLabel(formatAddress(address));
      setStatus('ready');
    } catch {
      if (mounted.current) setStatus('error');
    }
  }, []);

  const applyPermission = useCallback(
    (permission) => {
      if (permission.granted) return locate();
      setStatus(permission.canAskAgain ? 'denied' : 'blocked');
      return undefined;
    },
    [locate]
  );

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        const permission =
          current.status === 'undetermined'
            ? await Location.requestForegroundPermissionsAsync()
            : current;
        if (mounted.current) await applyPermission(permission);
      } catch {
        if (mounted.current) setStatus('error');
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [applyPermission]);

  const request = useCallback(async () => {
    if (status === 'blocked') {
      Linking.openSettings();
      return;
    }
    if (status === 'off' || status === 'error') {
      locate();
      return;
    }
    try {
      applyPermission(await Location.requestForegroundPermissionsAsync());
    } catch {
      setStatus('error');
    }
  }, [status, applyPermission, locate]);

  return { status, label, request };
}
