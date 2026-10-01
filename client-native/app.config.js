// Extends app.json with settings that come from the environment, so keys
// stay out of git. Put them in client-native/.env (git-ignored) or the EAS
// environment, e.g.
//   GOOGLE_MAPS_API_KEY=AIza…   (Maps SDK for Android, restricted to this app)
// Used by the heatmap and the Sisterhood Shield map.
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!mapsKey) {
    console.warn('GOOGLE_MAPS_API_KEY is not set: maps are left out of the app on Android.');
  }
  return {
    ...config,
    plugins: [
      ...config.plugins,
      ['react-native-maps', { androidGoogleMapsApiKey: mapsKey, iosGoogleMapsApiKey: mapsKey }],
    ],
    extra: {
      ...config.extra,
      // Without a key the native map crashes, so screens leave the map out.
      googleMapsConfigured: mapsKey !== '',
    },
  };
};
