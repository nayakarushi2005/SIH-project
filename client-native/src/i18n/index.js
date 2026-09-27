import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';

// Keep in sync with LANGUAGES in utils/profile.js and backend/services/profile.js.
export const SUPPORTED = ['en', 'hi', 'mr', 'bn', 'ta', 'te'];

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries({ en, hi, mr, bn, ta, te }).map(([lang, translation]) => [lang, { translation }])
  ),
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;
