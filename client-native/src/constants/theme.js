// Single source of truth for design tokens. Import from here instead of
// hard-coding values in screens so the brand can be changed in one place.

export const colors = {
  primary: '#0B7A4B',
  primarySoft: '#E7F3ED',
  background: '#FFFFFF',
  surface: '#F6F6F6',
  text: '#000000',
  textMuted: '#6B6B6B',
  textOnPrimary: '#FFFFFF',
  border: '#E6E6E6',
  decorative: '#E6E6E6',
  warning: '#9A5B00',
  warningSoft: '#FFF4E0',
  danger: '#B42318',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 2,
  md: 4,
};

export const typography = {
  heading: { fontSize: 28, lineHeight: 36 },
  title: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, lineHeight: 16 },
  button: { fontSize: 16, lineHeight: 20 },
};
