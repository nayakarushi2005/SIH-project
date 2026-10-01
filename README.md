# SIH Connect

| Folder | What it is | Run |
|---|---|---|
| `backend/` | Node/Express API (auth, profiles, categories, workers, federations) | `npm run dev` (port 3000) |
| `client-native/` | Expo mobile app (users and workers) | `npx expo start` |
| `client/` | Web portal for federations and government officials | `npm run dev` |
| `ai-service/` | Python AI service: voice onboarding agent (LangGraph + Vertex AI Gemini) | see `ai-service/README.md` (port 8000) |

## First-time setup

1. **Backend:** copy `backend/.env.example` to `backend/.env` and fill it in, then
   `npm install` and load the job categories once:
   `npm run seed:categories` (safe to re-run; edit `backend/data/categories.json` to change them).
2. **AI service:** follow `ai-service/README.md` (Python 3.12 venv, service-account key).
   Without a key it still works using rule-based understanding only.
3. **Mobile app:** the app uses native modules (location, speech), so it needs a
   development build, not Expo Go: `npx expo run:android` or
   `npx eas-cli@latest build --profile development`. Rebuild after pulling changes that add native modules.
   The app finds the backend (3000) and AI service (8000) on the laptop running Metro;
   set `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_AI_BASE_URL` for other setups.

## Sisterhood Shield (women's safety)

Open it from the red **SOS** button above the app's tab bar. While the shield is on, the phone
reports its position, the backend keeps a safety score for every ~38 × 19 m block of the city,
and an SOS (button, *Call 112*, saying "help"/"bachao", three volume-key presses, or the
notification) is shown to shield users within 2.5 km and to officials on the portal
(`/gov/safety`). Voice notes are recorded during an SOS and triaged by Gemini.

- **Mobile:** set `GOOGLE_MAPS_API_KEY` (Maps SDK for Android) in `client-native/.env` or the
  EAS environment, then rebuild the dev client — the shield adds native modules (maps, background
  location, notifications, audio, volume keys). iOS uses Apple Maps.
- **Backend:** Cloudinary must be configured (voice notes upload there). Run `npm run dispatcher`
  for voice-note triage and to close abandoned shields; triage needs the Vertex AI settings
  (`npm run llm:check`). Night-time reports weigh more, in `SAFETY_TIMEZONE` (default `Asia/Kolkata`).

Code: `backend/services/safety*.js`, `backend/routes/safety*.js`, `client-native/src/app/sisterhood.js`,
`client-native/src/services/shield.js`, `client/src/pages/gov/SafetyAlerts.jsx`.

## Tests

```bash
cd backend && npm test                                   # API (in-memory MongoDB)
cd ai-service && .venv/bin/pytest                        # agent, parsers, API
cd client-native && npm run test:i18n && npm run check:i18n && npx expo lint
cd client && npm run lint && npm run build
```

Design and plans: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
