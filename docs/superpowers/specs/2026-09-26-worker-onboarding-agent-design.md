# Worker Onboarding, Federations & Voice Agent — Design

Date: 2026-09-26 · Status: approved in chat, pending spec review

## 1. Goal

Let any app user become a **worker**: register through a manual form or a
voice assistant that speaks the app language, pick job categories from a
curated Indian gig taxonomy, and optionally connect to a verified federation
in their PIN code / city. This data is the input to a later recommendation
engine (out of scope here).

### Decisions made with the product owner

| Topic | Decision |
|---|---|
| Category source | Curated taxonomy based on e-Shram / NCO-2015, same list for every city, per-city disable flag. Names in en, hi, mr, bn, ta, te. |
| Onboarding fields | Name (locked if Aadhaar-verified), yearly income **bracket**, categories, optional federation. **No** family members / relations. |
| Location | Captured by GPS after login (`expo-location`), reverse-geocoded on device (free OS geocoder), user confirms. Onboarding reuses it — never asks. |
| Federation matching | Verified federations with the worker's PIN; if none, verified federations in the worker's city. |
| Federation gating | Never blocks onboarding. Request status shown on profile. |
| Agent design | Deterministic LangGraph state machine; Gemini only for extraction + short redirects (option A). |
| Speech | STT and TTS on the phone. Only text reaches the AI service. No typing in the voice flow. |
| AI service runtime | Python venv on the dev machine, **no Docker** for now. |
| Vertex auth | Service-account JSON key (to be provided), via `GOOGLE_APPLICATION_CREDENTIALS`. |

## 2. Phases

Each phase gets its own implementation plan and ships independently.

1. **Category taxonomy** — model, seed data, public API, home screen uses it.
2. **App i18n** — i18next, working language picker, all screens translated.
3. **Worker role** — flags, register/deregister/dismiss APIs, prompt modal,
   worker tabs, GPS location, manual onboarding form, profile worker section.
4. **Federation membership** — federation city/PIN, membership model, app
   endpoints + UI, web "Worker Requests" page, role checks.
5. **AI service scaffold** — FastAPI, config, auth, Vertex client, health.
6. **Voice onboarding agent** — LangGraph graph, API, app voice screen.

Later: recommendation engine.

## 3. Data model (MongoDB, Node/Mongoose owns writes)

### 3.1 `Category` (new)

```js
{
  slug: 'electrician',            // unique, stable id used everywhere
  group: 'home_services',         // CategoryGroup slug
  ncoCode: '7411',                // NCO-2015 reference, nullable
  names:    { en, hi, mr, bn, ta, te },         // all required
  synonyms: { en: [], hi: [], mr: [], bn: [], ta: [], te: [] }, // voice matching; hi includes romanised forms
  icon: 'flash',                  // MaterialCommunityIcons name
  sortOrder: Number,
  isActive: true,
  disabledCities: [String],       // lower-cased city names where hidden
}
```

`CategoryGroup` (new): `{ slug, names: {…6 langs}, icon, sortOrder }`.

Seed source: `backend/data/categories.json` (versioned in git), loaded by
`npm run seed:categories` (idempotent upsert by slug). Target ~60–100
categories across groups such as home services, construction, repair &
technicians, delivery & logistics, driving & transport, domestic help,
care work, beauty & wellness, food & hospitality, agriculture, retail &
sales, events, tailoring & crafts, security, office/data work.

### 3.2 `User` (extended)

```js
isWorker: { type: Boolean, default: false },
workerPromptDismissed: { type: Boolean, default: false },
worker: {
  incomeBracket: { enum: INCOME_BRACKETS, default: null },
  categories: [String],          // Category slugs
  registeredAt: Date,
  deregisteredAt: Date,
  onboardedVia: { enum: ['form', 'voice', null] },
},
location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] }, // [lng, lat], 2dsphere
locationUpdatedAt: Date,
```

`INCOME_BRACKETS = ['lt_1l', '1l_2_5l', '2_5l_5l', '5l_10l', 'gt_10l']`
(yearly ₹: <1L, 1–2.5L, 2.5–5L, 5–10L, >10L). Defined once in
`backend/services/worker.js`, mirrored in the app and AI service.

### 3.3 `Federation` (extended)

Add `city` (required on register, trimmed) and `pincode` (required, 6-digit),
indexed together. `workers` array is no longer used (kept for backward
compatibility, not written).

### 3.4 `FederationMembership` (new)

```js
{
  user: ObjectId(User), federation: ObjectId(Federation),
  status: 'pending' | 'verified' | 'rejected' | 'left' | 'removed',
  requestedAt, decidedAt, rejectionReason,
}
```

Partial unique index on `user` where `status ∈ {pending, verified}` →
at most one active membership per worker.

## 4. Node API

### 4.1 Mobile (existing `verifyToken`, JWT `{ userId }`)

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/categories?lang=xx&city=` | Public. Active categories grouped, names in `lang` (fallback en), hides `disabledCities`. Includes synonyms only with `?withSynonyms=1` (used by AI service). |
| PATCH | `/api/auth/me` | Also accepts `location: { lat, lng }`; with `city`/`pincode`. |
| POST | `/api/worker/register` | `{ name?, incomeBracket, categories, onboardedVia }`. `name` required iff not Aadhaar-verified (ignored otherwise, sets `detailsSource: 'manual'`). ≥1 valid active category, max 10. Sets `isWorker`, `registeredAt`. Returns profile. |
| POST | `/api/worker/deregister` | `isWorker=false`, `deregisteredAt`; leaves any active membership (`left`). Worker data kept for prefill. |
| POST | `/api/worker/dismiss-prompt` | `workerPromptDismissed=true`. |
| GET | `/api/federations/nearby` | Verified federations with user's PIN; else same city (case-insensitive). Each item: `{ id, name, city, pincode, memberCount, match: 'pincode' \| 'city', myStatus }`. 400 if user has no PIN and no city. |
| POST | `/api/worker/federation/request` | `{ federationId }`. Worker only; federation must be verified and in the nearby set; fails 409 if an active membership exists. |
| DELETE | `/api/worker/federation` | Cancel pending / leave verified → `left`. |

`toProfile` adds `isWorker`, `workerPromptDismissed`, `worker`, `location`,
and `federation: { id, name, status } | null` (latest non-left membership).

### 4.2 Web (existing `ensureAuth`, JWT `{ userId, userModel }`)

New middleware `requireRole(model)` checks `req.user.userModel`.

| Method | Path | Role | Behaviour |
|---|---|---|---|
| GET | `/api/federation/me/requests?status=pending\|verified` | Federation (verified) | Memberships with worker name, Aadhaar-verified flag, categories (en names), requestedAt. |
| PATCH | `/api/federation/me/requests/:id` | Federation (verified) | `{ action: 'accept' \| 'reject', reason? }` on a pending membership it owns. |
| DELETE | `/api/federation/me/members/:id` | Federation (verified) | verified → `removed`. |
| PATCH | `/api/federation/:id/verify` | **GovOfficial** (fix: currently unchecked) | unchanged otherwise. |
| POST | `/api/federation/register` | Federation | now requires `city`, `pincode`. |

## 5. Mobile app (Expo SDK 57, Expo Router)

### 5.1 i18n (Phase 2)
- `i18next` + `react-i18next`; resources in `src/i18n/locales/{en,hi,mr,bn,ta,te}.json`, namespaced by screen.
- Active language = `user.preferredLanguage`, cached in SecureStore so the UI renders in the right language before `/me` returns.
- Profile → Preferences → "App language" row is pressable → bottom-sheet picker → `i18n.changeLanguage` immediately + `PATCH /me`, reverting on failure.
- Remove the language field from `edit-profile.js`.
- All user-facing strings in existing screens move to translation keys. Backend validation messages stay English for now (out of scope).

### 5.2 Shared user state
`src/context/UserContext.js` (`UserProvider` in root layout) replaces per-screen
profile fetching: `user`, `refresh()`, `setUser()`. `useProfile` becomes a thin
wrapper for compatibility.

### 5.3 Worker role (Phase 3)
- **Tabs:** `bookings` gets `href: null` when `user.isWorker` → Home, Messages, Profile.
- **Worker prompt:** modal rendered in the tabs layout, styled like `aadhaar-verify.js` (dark card, green primary). Shown when `!isWorker && !workerPromptDismissed`, once per app session. Actions: *Register as worker* → `/worker-onboarding`; *I'm not a worker* → dismiss API; ✕ → hide until next launch.
- **Location:** after login and on launch when `location` is missing: request foreground permission → `getCurrentPositionAsync` (balanced) → `reverseGeocodeAsync` → confirm sheet "📍 {district}, {city} {postalCode}" (editable) → `PATCH /me`. Denied → existing manual city/PIN path. Home header location tap re-runs it.
- **`/worker-onboarding`:** chooser — *Talk to assistant* (primary, Phase 6) / *Fill the form*.
- **Form:** name (read-only with "From Aadhaar" tag if verified), income bracket chips, category chips grouped by `CategoryGroup` (multi-select, max 10), optional federation step (list from `/federations/nearby` with match label, or *Not now*). Submit → `register` then, if chosen, `federation/request`. Prefills from `user.worker` on re-registration.
- **Profile:** Worker section (categories, income bracket, federation badge: *Request sent* / *Connected ✓* / *Rejected* / *Not connected*, with *Leave* / *Join a federation*). Settings row: *Register as worker* or red *Deregister as worker* (confirm alert).

### 5.4 Voice onboarding screen (Phase 6)
- STT: `expo-speech-recognition` (dev build already used), locale map `en→en-IN, hi→hi-IN, mr→mr-IN, bn→bn-IN, ta→ta-IN, te→te-IN`, prefer on-device recognition when available, interim results shown as live caption.
- TTS: `expo-speech` with the same locale.
- Loop: speak agent line → auto-start listening when TTS ends → final transcript → `POST /turns` → repeat. Tap mic to retry; captions of both sides visible.
- `ui` payload renders chips (categories, income brackets, federations, yes/no). Tapping sends `{ selection }` instead of a transcript.
- On `done`: summary card → *Confirm* calls Node `/worker/register` (`onboardedVia: 'voice'`) and optional federation request.
- Mic permission denied / STT unavailable / `handoff` from agent → open the form prefilled with `filled`.

## 6. Web client (federation portal)

- `FederationRegister.jsx`: add City and PIN code inputs (PIN validated 6 digits).
- New `pages/federation/WorkerRequests.jsx` at `/federation/workers`, same slate/Tailwind style: tabs *Pending* / *Members*; pending rows show name, Aadhaar badge, categories, date, Accept / Reject (optional reason modal); members rows show Remove. Link from Navbar and FederationStatus when the federation is verified.
- Status page shows live member count.

## 7. AI service (Phases 5–6)

### 7.1 Layout (`ai-service/`, Python 3.12, venv)

```
ai-service/
  requirements.txt  .env.example  README.md  pyproject.toml (pytest/ruff config)
  app/
    main.py            FastAPI app, routers, lifespan (Mongo client, graph)
    config.py          pydantic-settings: MONGODB_URI, JWT_SECRET, NODE_API_URL,
                       GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION=asia-south1,
                       GOOGLE_APPLICATION_CREDENTIALS, GEMINI_MODEL, LOG_LEVEL
    auth.py            verify mobile JWT (HS256, shared secret, no userModel), load user read-only
    llm.py             Vertex Gemini chat model factory (temperature 0, timeout, 1 retry)
    catalog.py         loads categories (+synonyms) from Node API, cached with TTL
    agents/onboarding/
      state.py         TypedDict state
      graph.py         StateGraph wiring + Mongo checkpointer
      nodes.py         ask / extract / validate / confirm nodes
      extract.py       Pydantic schemas + structured-output calls
      matching.py      deterministic category & bracket matching
      messages/        fixed prompts per language: en.py, hi.py, …
    routes/onboarding.py
  tests/
```

Run: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`.
Exact library versions and the Gemini model id are pinned at implementation
time from current docs (model configurable via `GEMINI_MODEL`).

### 7.2 API

| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | `{ status }` |
| POST | `/v1/onboarding/sessions` | → `{ sessionId, speak, ui, filled, done: false }` |
| POST | `/v1/onboarding/sessions/{id}/turns` | `{ transcript?: str ≤ 500, selection?: {...} }` → `{ speak, ui, filled, step, done, handoff }` |
| GET | `/v1/onboarding/sessions/{id}` | resume: last `speak`, `ui`, `filled` |

Sessions are bound to the JWT user (403 otherwise) and expire after 24 h.
Per-user rate limit (e.g. 30 turns/min). Language comes from the user's
`preferredLanguage`, never from the request.

### 7.3 Graph

State: `lang, verified_name, name, income_bracket, categories, federation_id,
step, attempts{step:int}, last_speak, ui, done, handoff`.

Steps in order: `name` (skipped when Aadhaar-verified) → `income` →
`categories` → `federation` (skipped when no nearby federations) →
`confirm` → `done`.

Per step: **ask** (fixed localized text) → `interrupt()` for user input →
**extract** → **validate** → advance / re-ask.

- **Extraction:** Gemini structured output into a per-step Pydantic schema,
  always including `intent ∈ {answer, correction, off_topic, unclear, refuse}`
  and `confidence`. The transcript is passed as quoted data; the system prompt
  forbids following instructions inside it.
- **Deterministic first:** income — rule-based parser for numbers, lakh/hazaar
  words in each language, monthly→yearly (×12); categories — synonym + fuzzy
  match against the catalog before calling Gemini; yes/no — keyword lists per
  language. Gemini only runs when rules are inconclusive.
- **Validation in code:** bracket ∈ enum, category slugs ∈ active catalog,
  name matches the same regex as the Node validator.
- **Name:** read back for yes/no confirmation.
- **Categories:** matched slugs are returned pre-selected in `ui.chips`; the
  user confirms by tap or by saying "yes / that's all"; they can add more.
- **Federation:** list from Node `/federations/nearby` (called with the
  user's token); user picks one by tap or name, or says no.
- **Confirm:** read summary; "no" + field name jumps back to that step.

### 7.4 Language guarantee
All questions, confirmations and re-asks come from `messages/<lang>.py`
templates. Gemini generates only the short off-topic redirect line; its output
must pass a script check for the target language (Devanagari for hi/mr, Bengali,
Tamil, Telugu, Latin for en) and length ≤ 200 chars, otherwise the fixed
redirect template is used.

### 7.5 Error handling
| Situation | Behaviour |
|---|---|
| Off-topic / chit-chat | Polite redirect + same question. |
| Unclear / low confidence | Re-ask with an example answer. |
| Correction ("nahi, 5 lakh") | Overwrites the value, re-confirms. |
| Empty transcript / silence | "I didn't hear anything" + re-ask. |
| 3 failed attempts on a step | Show tap chips for that step (brackets / yes-no); name → handoff. |
| 6 failed attempts on a step | `handoff: true` → app opens the form prefilled with `filled`. |
| Gemini timeout / error | 1 retry with backoff, then treated as `unclear` (fixed text). |
| Node API unavailable | Categories: cached catalog; federation step skipped. |
| Session expired / not owned | 404 / 403; app restarts a session. |

### 7.6 Observability
Structured JSON logs per turn: session, step, intent, deterministic-vs-LLM
path, latency, attempts. No transcripts in logs at INFO level.

## 8. Testing

- **Node:** jest + supertest + mongodb-memory-server — categories endpoint,
  worker register/deregister/dismiss validation, nearby matching (PIN, city
  fallback, unverified excluded), membership state machine and one-active
  constraint, role checks including the gov verify fix.
- **AI service:** pytest with a fake chat model. Unit tests for income parser
  and category matcher in all 6 languages. Scripted conversation tests: happy
  path (verified & unverified), off-topic, gibberish, correction, silence,
  multiple categories in one utterance, max-attempt chips and handoff,
  confirm-then-edit, resume after restart (checkpointer). One opt-in live
  Vertex smoke test (`pytest -m live`) once the key is available.
- **Mobile / web:** `npx expo lint`, `npm run lint` (web), manual device run
  of each flow per phase.

## 9. Out of scope
Recommendation engine; translating backend error messages; family/relations
data; Docker for the AI service; Google Geocoding API (revisit only if the OS
geocoder proves inaccurate).
