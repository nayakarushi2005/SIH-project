// app.json plus settings that must not be committed. Expo loads .env before
// reading this file, so put the key in client-native/.env (or the EAS
// environment):
//   GOOGLE_MAPS_API_KEY=...   Maps SDK for Android key, for the Sisterhood Shield map.
// iOS uses Apple Maps and needs no key.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn('GOOGLE_MAPS_API_KEY is not set: the Sisterhood Shield map will be blank on Android.');
  }
  return {
    ...config,
    plugins: [...config.plugins, ['react-native-maps', { androidGoogleMapsApiKey: key }]],
    // Without a key Google Maps crashes the app, so the shield leaves the map out.
    extra: { ...config.extra, googleMapsConfigured: !!key },
  };
};
