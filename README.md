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

## Tests

```bash
cd backend && npm test                                   # API (in-memory MongoDB)
cd ai-service && .venv/bin/pytest                        # agent, parsers, API
cd client-native && npm run test:i18n && npm run check:i18n && npx expo lint
cd client && npm run lint && npm run build
```

Design and plans: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
