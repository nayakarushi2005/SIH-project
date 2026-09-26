import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, StyleSheet } from 'react-native';

import { darkColors, lightColors } from '../constants/theme';
import { getThemePreference, setThemePreference } from '../services/session';

const ThemeContext = createContext({ dark: false, colors: lightColors, setDark: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDarkState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getThemePreference()
      .catch(() => 'light')
      .then((value) => {
        if (!cancelled) setDarkState(value === 'dark');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dark === null) return;
    try {
      Appearance.setColorScheme(dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);

  const setDark = useCallback((value) => {
    setDarkState(value);
    setThemePreference(value ? 'dark' : 'light').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ dark: !!dark, colors: dark ? darkColors : lightColors, setDark }),
    [dark, setDark]
  );

  if (dark === null) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function makeStyles(factory) {
  const light = StyleSheet.create(factory(lightColors));
  const dark = StyleSheet.create(factory(darkColors));
  return function useStyles() {
    return useTheme().dark ? dark : light;
  };
}
