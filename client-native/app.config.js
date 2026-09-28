// Extends app.json with settings that come from the environment, so keys
// stay out of git. Put them in client-native/.env (git-ignored), e.g.
//   GOOGLE_MAPS_API_KEY=AIza…   (Maps SDK for Android, restricted to this app)
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  return {
    ...config,
    plugins: [
      ...config.plugins,
      ['react-native-maps', { androidGoogleMapsApiKey: mapsKey, iosGoogleMapsApiKey: mapsKey }],
    ],
    extra: {
      ...config.extra,
      // Without a key the native map crashes, so the app shows a list instead.
      googleMapsConfigured: mapsKey !== '',
    },
  };
};
