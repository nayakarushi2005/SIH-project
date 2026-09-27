# Voice Job-Posting Agent & App i18n Fix — Design

Date: 2026-09-27 · Status: implemented, describing shipped code

## 1. Goal

Two problems surfaced after merging the `job_posting` branch: parts of the
app stayed hardcoded in English regardless of the user's chosen language,
and backend error text was shown to the app verbatim in English. This work
finished the i18n migration for the job/worker/feedback screens and added a
voice-first way to post a job, mirroring the worker onboarding agent
(`ai-service/app/agents/onboarding/`): a LangGraph state machine on Vertex
AI Gemini, rules-first with LLM fallback, that speaks and writes in the
app's language.

### Decisions made with the product owner

| Topic | Decision |
|---|---|
| Photos | Voice collects the text fields only; the app then shows a photo step (still required, 1–5) plus a summary, then posts via the existing `POST /api/jobs`. |
| Language on the job | `Job` gets a `language` field (poster's ISO code). The description is written in that language. No English copy for now. |
| Error codes | Backend returns stable `code`s (and `fieldCodes`); the app translates by code, falling back to the server's English text when no key exists. |
| Entry points | "Post by voice" button on the create-job screen; a voice CTA on Home. |
| Description editing | No in-place editor on the draft card — accept or redo only. |
| Hardcoded-string guard | Strict only for `src/app/**` and `src/components/**` (see §5.2). |

## 2. Phases

1. **Backend** — `Job.language`/`postedVia`, `services/errors.js`, coded
   error responses across jobs/worker/feedback/profile validators.
2. **App i18n migration** — error mapping by code, locale keys for job
   lifecycle/feedback/worker screens, `utils/job.js`/`utils/traits.js` return
   translation keys instead of English strings, hardcoded-string guard.
3. **AI service** — shared modules lifted into `agents/common/`; new
   `agents/job_posting/` graph, messages, extraction schemas; new
   `routes/job_posting.py`.
4. **App: voice screen + wiring** — `services/ai.js` job-posting calls,
   `useAgentConversation`, `useJobPhotos`, `LocationCard`, `create-job-voice.js`,
   prefill handoff from `create-job.js`.
5. **Docs** — this document; `ai-service/README.md` updated for the new
   endpoints.

## 3. Data model

### 3.1 `Job` (extended — `backend/models/Job.js`)

```js
language:  { type: String, enum: LANGUAGES, default: 'en' },   // LANGUAGES from services/profile.js
postedVia: { type: String, enum: ['form', 'voice'], default: 'form' },
```

`toJob`/`toOffer` (`backend/services/job.js`) include `language`; `toJob`
also includes `postedVia`. Both are set from the request body through the
same `validators` map as every other job field — `language` defaults to
`'en'` when missing and rejects anything outside `LANGUAGES`; `postedVia`
is `'voice'` only when the body says so, `'form'` otherwise (never fails).

### 3.2 Coded error responses (`backend/services/errors.js`)

```js
fieldError(code, message, params?)              // a validator throws this instead of a bare string
sendError(res, status, code, message, extra)     // res.status(status).json({ error, code, ...extra })
splitFieldErrors(errors)                          // { fields, fieldCodes, fieldParams }
```

Backward compatible: the response keeps `{ error }` (human message) and
`fields: { [field]: string }`; `code`, `fieldCodes` and `fieldParams` are
additive. A validation failure from `POST /api/jobs` looks like:

```json
{
  "error": "Please fix the highlighted fields.",
  "code": "validation",
  "fields": { "price": "Enter a price between ₹50 and ₹1,00,000." },
  "fieldCodes": { "price": "job_price_range" },
  "fieldParams": {}
}
```

Route-level errors (not-found, conflict, etc.) carry `code` and optional
`params` the same way, e.g. `job_start_code_wrong` with
`params: { left }`. All ~50 codes are catalogued in
`backend/docs/error-codes.md`, one per line with English text and any
params; job-specific ones are `job_category_required`,
`job_description_length`, `job_photos_required`, `job_photos_max`,
`job_photos_invalid`, `job_price_range`, `job_duration_range`,
`job_address_length`, `job_location_invalid`, `job_language_invalid`,
`job_not_found`, `job_unavailable`, `job_cannot_start`,
`job_start_code_wrong`, `job_start_code_too_many`, `job_cannot_complete`,
`job_cannot_withdraw`, `job_cannot_cancel`, `job_create_failed`,
`job_load_failed`, `job_update_failed`. `worker_busy` and `offer_closed`
also appear on job routes. The pre-existing uppercase codes
`AADHAAR_REQUIRED` / `NOT_REGISTERED` (`routes/workers.js`,
`routes/worker.js`) are untouched.

## 4. Node API

`POST /api/jobs` (unchanged path/verb, extended body/response):

| | |
|---|---|
| Body | `{ category, description, photos: [url], price, expectedDurationMins, location: { lat, lng }, address?, language?, postedVia? }` |
| 201 | `toJob(job, user._id)` — includes `language`, `postedVia`, plus the existing lifecycle fields |
| 400 | `{ error, code: 'validation', fields, fieldCodes, fieldParams }` |
| 500 | `{ error, code: 'job_create_failed' }` |

`language` defaults to `'en'` server-side if the app omits it (never
sent by `create-job.js`, which always sends `i18n.language`); an unknown
language value 400s with `job_language_invalid`. `postedVia` defaults to
`'form'`; the voice screen sends `'voice'`. A job finished on the form
after a voice handoff is posted with `postedVia: 'form'` — the field
reflects how the job was actually submitted, not how it started.

## 5. Mobile app

### 5.1 i18n migration

`getErrorMessage`/`getFieldErrors` (`client-native/src/services/api.js`)
look up `serverErrors.<code>` first (with `data.params` / per-field
`fieldParams` as interpolation), falling back to the server's own `error`
text when no key exists for that code — so a code the app doesn't
recognise still degrades to readable (English) text instead of breaking.
AI-service codes (`busy`, `finished`, `not_found`, `forbidden`,
`rate_limited`) get the same `serverErrors.*` treatment.

Screens/components migrated onto `i18next` keys: `create-job.js`,
`feedback.js`, `worker.js`, `worker-profile.js`, `WorkerJobCard`,
`OfferModal`, `PhotoPicker`, `WorkerInsightsCard`, `JobCard`, `bookings.js`,
`location.js`, `useCategories.js`. `utils/job.js`'s `DURATIONS` entries
carry translation keys instead of English `label`s (`durationOptions(t)`,
`formatDuration`/`formatDistance` call `i18n.t`); `jobStatus()` returns a
key for the caller to pass to `t`; `utils/traits.js` returns keys instead
of strings.

### 5.2 Hardcoded-string regression guard

`client-native/scripts/check-i18n.mjs` gains `checkHardcoded(files)`,
scanning only `src/app/**` and `src/components/**` for: JSX text nodes with
3+ consecutive Latin letters, string literals on
`label|placeholder|title|hint|body|accessibilityLabel|accessibilityHint`
props, and quoted literals in the first two arguments of `Alert.alert(`.
An allowlist covers non-user-facing values (`OK`, `₹`, `…`, `—`,
identifier-like prop values such as `secondary`/`number-pad`); a
`// i18n-ignore` comment on the line (or the line above) opts a string out.
Wired into the CLI after `checkLocales`, so `npm run check:i18n` fails the
build on a new hit. This guard is Task 6's own work, done concurrently with
this doc; see `client-native/scripts/check-i18n.mjs` and
`check-i18n.test.mjs` for the landed implementation.

### 5.3 Voice job-posting screen

`services/ai.js` adds `startJobPosting({ category })` (always sends
`lang: i18n.language`), `sendJobTurn(sid, payload)`, `getJobPosting(sid)` —
same shapes as the onboarding calls, against `/v1/job-posting/...`.

`hooks/useAgentConversation.js` lifts the conversation loop out of
`worker-voice.js` (speak → listen → send → repeat, one conversation per
mount, a monotonically increasing `turn` counter so a stale response or
listen result is dropped) and parametrises it by `{ start, sendTurn }` plus
the screen's speech/i18n/navigation callbacks. It exposes
`{ res, phase, setPhase, heard, tap, sync, mic }`. `worker-voice.js` was
migrated onto this hook with no behaviour change; `create-job-voice.js` is
the second consumer.

`hooks/useJobPhotos.js` lifts the photo-upload block out of
`create-job.js`: each picked photo uploads immediately
(`status: 'uploading' | 'done' | 'error'`), exposing
`{ photos, addPhotos, removePhoto, retryPhoto, uploading, allUploaded, urls }`.
`components/LocationCard.js` is the shared location-confirmation card. Both
`create-job.js` and `create-job-voice.js` use them.

`app/create-job-voice.js` renders by `res.ui.type`: `category` (single-select
`CategoryPicker`, filtered to `ui.options` when the agent narrowed it),
`description` (draft card + Yes/"say it again"), `text` (typed fallback
after repeated failures), `duration` (`OptionGroup` with
`durationOptions(t)`), `skip` (address skip / typed address), `fields`
(tap-to-edit at confirm), `summary`. Photos, the location card, and the
Post button only render **once the conversation is done**
(`phase === 'summary'`, driven by `useAgentConversation`'s `handle()`
setting `phase` to `'summary'` when a turn response has `done: true`) — the
voice flow never asks for a photo itself. `canPost` requires both an
uploaded photo (`urls.length > 0`) and a resolved location
(`location.status === 'ready'`); when either is missing the Post button is
disabled and a hint (`voiceJob.needPhotos` / `voiceJob.needLocation`) tells
the user why. Posting sends
`{ ...res.filled, photos: urls, location: location.coords, address: res.filled.address, language: res.lang, postedVia: 'voice' }`
to `createJob`; field errors on `photos`/`location` show inline, any other
field error alerts and falls back to the form (`toForm`). A `handoff` from
the agent, a server error, or "Use the form instead" all route to
`/create-job` with `params: { prefill: JSON.stringify(filled) }`.

`app/create-job.js` reads `prefill` the same way as `worker-form.js`'s
prefill pattern, sends `language: i18n.language, postedVia: 'form'` on
submit, and adds a secondary "Post by voice" button that navigates to
`/create-job-voice?service=<category>` (so a category picked on the form
before switching to voice pre-selects that step).

## 6. AI service

### 6.1 Layout

```
ai-service/app/
  agents/common/        lexicon.py, parsers.py, catalog.py, extract.py, flow.py, state.py
  agents/onboarding/     unchanged behaviour; parsers.py, catalog.py etc. are now
                          re-export shims over agents/common/ (import * plus explicit
                          underscore names such as _has, _amounts that graph.py and
                          tests/test_parsers.py import directly)
  agents/job_posting/    state.py, messages.py, extract.py, text.py, graph.py
  routes/job_posting.py
  sessions.py            session_lock, StartIn, TurnIn, config_for, load_session
                          (lifted out of routes/onboarding.py; both routers use it)
```

`agents/common/parsers.py` holds `parse_income` (onboarding), `parse_amount`
and `parse_duration` (job posting) side by side, but their number/unit
vocabularies are kept deliberately separate (`_UNIT_RANK`/`_UNIT_VALUE` for
income vs. `_AMOUNT_UNIT_RANK`/`_AMOUNT_UNIT_VALUE` for `parse_amount`;
duration's plural/romanised forms and `dedh`/`dhai` live in
`_DURATION_*` sets) specifically so `parse_income`'s behaviour stays
byte-identical to before the move — job posting introducing "hazaar" or
plural duration words never changes what onboarding accepts.

`app/sessions.py` `load_session(graph, sid, user, kind)` reads the
checkpoint tuple directly — `checkpointer.aget_tuple(config_for(sid))` and
its `checkpoint["channel_values"]` — instead of `graph.aget_state()`.
`aget_state()` filters a checkpoint's values down to the fields the
*calling* graph's `TypedDict` declares, so a job-posting checkpoint read
through the onboarding graph (or vice versa) would silently lose its
`kind` field before the mismatch check ever saw it. Reading the raw
checkpoint keeps `kind` visible so a session id from one flow reliably
404s on the other flow's route.

### 6.2 Endpoints (`app/routes/job_posting.py`, prefix `/v1/job-posting`)

| Method | Path | Body → Response |
|---|---|---|
| POST | `/sessions` | `{ lang?, category? }` → `{ sessionId, speak, ui, step, done, handoff, filled, lang }` |
| POST | `/sessions/{sid}/turns` | `{ transcript }` or `{ selection }` → same shape minus `sessionId` |
| GET | `/sessions/{sid}` | resume: same shape (last `speak`/`ui`/`filled`) |

Same session lock (409 `busy` on a concurrent turn), 24h TTL (`404
not_found`), per-user rate limit, and JWT-via-Node's-`/auth/me` auth as
onboarding. A `category` in the start body is silently ignored if it isn't
in the current catalogue. An onboarding session id used on a job-posting
route (or vice versa) is a 404, enforced by `load_session`'s `kind` check.

### 6.3 Graph (`agents/job_posting/graph.py`)

State (`JobPostingState`, `agents/job_posting/state.py`): `kind
("job_posting"), owner, created_at, lang, category, description,
description_draft, description_source ('llm'|'transcript'|None), price,
duration_mins, address, address_decided, step, attempts, return_to_confirm,
turn, outcome, ack, speak, ui, done, handoff`.

Steps in order: `category` (skipped when a valid category was preselected
on start) → `description` → `description_confirm` → `price` → `duration` →
`address` → `confirm` → `done`, plus `change` (from confirm, jumps to the
named field and returns to confirm) and `handoff`. Each turn runs
`understand → decide → ask` as one graph invocation (`START → understand →
decide → ask → END`).

Constants: `PRICE_MIN=50, PRICE_MAX=100_000, DURATION_MIN=15,
DURATION_MAX=10_080 (7 days), DESC_MIN=10, DESC_MAX=500, ADDRESS_MIN=5,
ADDRESS_MAX=300, DURATION_PRESETS=(30,60,120,240,480,2880)`,
`BUTTONS_AFTER=3, HANDOFF_AFTER=6, DESCRIPTION_HANDOFF_AFTER=4`.

Per-field understanding:
- **Category** — `match_categories` against the catalogue; one match
  accepts, several return `ui.type: 'category'` with the matched options,
  none falls to a `CategoryOut` LLM call constrained to the catalogue's
  candidate slugs.
- **Description** — never rule-only. Below `DESC_MIN` normalised chars it
  fails as `too_short`. Otherwise a `DescriptionOut` LLM call runs with
  `DRAFT_SYSTEM_PROMPT` (below); its output must pass `sanitize_draft`
  (script check via `in_script`, length, control-character stripping) or
  the fallback is `clean_dictation(text)` (NFC, collapse whitespace, strip
  leading filler words per language, sentence/word-boundary cut to 500).
  `description_source` records which one won (`'llm'` or `'transcript'`).
- **description_confirm** — yes commits `description_draft` as
  `description`; no clears the draft and re-asks `description` (counts
  against the shared `description` attempt bucket, capped at
  `DESCRIPTION_HANDOFF_AFTER=4`, lower than the general `HANDOFF_AFTER=6`
  since there are no tap choices for a description).
- **Price** — `parse_amount` (rules) first, then a `PriceOut` LLM call;
  either way the amount is range-checked against `PRICE_MIN`/`PRICE_MAX`.
- **Duration** — `parse_duration(text, lang)` (rules) first, then
  `DurationOut`; range-checked against `DURATION_MIN`/`DURATION_MAX`.
- **Address** — short skip-shaped replies (≤3 words matching `lx.SKIP`, a
  short "no", or a short "done") clear the address; otherwise the text
  itself must be 5–300 chars.
- **confirm / change** — yes/no via `detect_yes_no`, plus `_detect_field`
  matching per-field words (`field_category` label plus extras like "kaam",
  "rate", "समय", "চিকানা"-family words) to catch "no, change the price" in
  one utterance. Category words are checked **last** in `_FIELD_ORDER`
  (`FIELDS` with `category` moved to the end) because "work"/"kaam"/"வேலை"
  show up in most sentences about the job (e.g. "काम का दाम बदलो" — "change
  the job's price" — must resolve to `price`, not `category`), and because
  a plain "yes" that happens to mention a field name (e.g. "yes, the price
  is right") should confirm, not edit — that combination only becomes an
  edit when the utterance also reads as a change/no.

Taps: `{category}`, `{yes}` (description_confirm/confirm), `{field}`
(confirm/change), `{price}`, `{durationMins}`, `{address}`/`{skip:true}`,
`{description}` (a typed description commits through `clean_dictation`,
re-entering `description_confirm`). `ui.type` values: `category`,
`description`, `text` (after `BUTTONS_AFTER` failures on price/description),
`duration` (preset buttons after `BUTTONS_AFTER` failures), `skip`,
`fields`, `summary`. Failures beyond `HANDOFF_AFTER` (or
`DESCRIPTION_HANDOFF_AFTER` for description) set `handoff: true`; the app
then hands off to the form pre-filled with whatever was collected.

`filled(state)` → `{category, description, price, expectedDurationMins:
duration_mins, address, language: lang}` — the same shape the app sends on
to `POST /api/jobs` once photos and location are added.

### 6.4 Drafting prompt, schema, fallback, safety

`DescriptionOut` (`agents/job_posting/extract.py`) has one field,
`description: str | None`. `DRAFT_SYSTEM_PROMPT` instructs the model to
rewrite the transcript into 1–3 plain sentences, 10–500 characters, in
`{language_name}`'s own script only, using **only facts said** (no
invented prices, times, names, phone numbers or addresses), no headings,
lists or emojis; the transcript is fenced as `<transcript>` data the model
must not follow as instructions; if the transcript doesn't describe a job
it sets `intent: off_topic` and a short `redirect` sentence instead. This
follows the same `Extractor` protocol (structured output, timeout, one
retry, `None` on failure) as every other extraction in both agents.

Post-generation safety net (`agents/job_posting/text.py`
`sanitize_draft`): strips Unicode control characters, NFC-normalises,
collapses whitespace, cuts to `DESC_MAX` at a sentence/word boundary, and
rejects the draft outright (falling back to `clean_dictation` of the raw
transcript) if it's under `DESC_MIN` chars or fails `in_script(text, lang)`
— so a wrong-script or garbled LLM output never reaches the user. This
mirrors the language guarantee from onboarding: **all questions,
confirmations, and re-asks come from `messages.py` templates**; the LLM
only ever produces the description draft and the short off-topic redirect,
and both are checked before being spoken or shown.

### 6.5 Language guarantee

`messages.py` provides EN/HI/MR/BN/TA/TE templates for every prompt/ack/
retry line via `msg(lang, key, **kwargs)`. The LLM's only free-text output
(the description draft, the off-topic redirect) is checked with
`in_script` and a length cap (`safe_redirect`, 200 chars) before use;
failing either falls back to a fixed template line, so the session never
switches language or breaks script mid-conversation.

### 6.6 Error handling

| Situation | Behaviour |
|---|---|
| Off-topic / chit-chat | Redirect line (LLM's if safe, else fixed `redirect` template) + same question repeated. |
| `too_short` (description under 10 chars, address under 5) | Fixed retry line (`description_short` / `address_short`), re-ask. |
| `out_of_range` (price/duration outside min–max) | Fixed range line (`price_range` / `duration_range`), re-ask. |
| `ambiguous` (multiple category matches) | `category_which` lists the matched names; `ui.type: 'category'` with those options. |
| Unclear / no intent from the LLM | `unclear` line, re-ask. |
| Empty transcript | `not_heard` line, re-ask. |
| `BUTTONS_AFTER` (3) failed tries on a step | Tap/typed `ui` (text field, duration presets, category chips) offered, announced once via `use_buttons`. |
| `HANDOFF_AFTER` (6) / `DESCRIPTION_HANDOFF_AFTER` (4, description only) | `handoff: true`; app opens the form pre-filled with `filled`. |
| Gemini timeout/error | `Extractor` returns `None` → treated as `unclear` (or `too_short`/`invalid` where a rule already failed first). |
| Node API (catalogue) unavailable | `take_turn` fetches the catalogue before invoking the graph, so a Node outage 5xxs the turn before any state changes; on session start an unknown/unreachable-catalogue preselected category is dropped. |
| Session expired / wrong kind / not owned | 404 (`not_found`) or 403 (`forbidden`) from `load_session`; app restarts a session. |
| Concurrent turn on the same session | 409 (`busy`) from the session lock. |

### 6.7 Observability

One structured log line per turn (`log.info` in `understand`):
`turn step=%s reason=%s path=%s ms=%d lang=%s` — step, outcome reason
(`answer`/`too_short`/`out_of_range`/`ambiguous`/`unclear`/`off_topic`/
`not_heard`/`invalid`), which path decided it (`rules`/`llm`/`tap`),
latency in ms, and language. No transcript or description is ever logged.

## 7. Testing

- **Backend (`backend/tests/`, jest + supertest + mongodb-memory-server):**
  `validateNewJob` with `language` present/missing/invalid; `POST
  /api/jobs` on an empty body asserts `code: 'validation'` and
  `fieldCodes` are present for each field.
- **AI service (`ai-service/tests/`, pytest with `FakeExtractor`/
  `NullExtractor` fakes, no network):**
  - `test_common_parsers.py`: `parse_amount` and `parse_duration` tables
    across languages/registers, plus `test_parse_income_unaffected_by_amount_duration_vocabulary`
    asserting `parse_income`'s output didn't change once `parse_amount`/
    `parse_duration` vocabulary was added alongside it.
  - `test_job_graph.py` (a `Convo` helper driving `build_graph`): Hindi
    happy path with a scripted `FakeExtractor`; `NullExtractor` fallback
    uses the cleaned transcript (`source == 'transcript'`); a wrong-script
    LLM draft is replaced; a long draft is cut at a sentence end; "no" at
    `description_confirm` re-asks; price below the minimum is
    `out_of_range`; three duration failures show presets, more hand off;
    address skip and an address containing "no" still treated as an
    address; confirm-no-with-a-field edits that field and returns to
    confirm; a plain "no" at confirm goes to `change`, and description
    passes through confirm; a preselected category starts at `description`;
    injected instruction text inside a transcript is treated as inert data;
    a full happy path (category by speech, description by tap, price,
    duration, then a "no" and "yes" at confirm) where rules resolve every
    step so `extractor.calls == []`; ambiguous category offers the
    matched options; description retries hand off after four; every line
    on the happy path passes the target-language script check, for every
    language; the "work" word doesn't hide the field actually being
    changed (parametrised over language/reply/step).
  - `test_job_posting_api.py`: start speaks Hindi by default and honours
    the app's current language; unknown category is ignored; a known
    category starts at `description`; a speech turn advances the
    conversation; `GET` resumes with the same `speak`; another user's
    session 403s; a turn after `done` is 409 (`finished`); a concurrent
    turn is 409 (`busy`); an onboarding session id on the job route (and
    vice versa) is 404.
  - `test_extract.py`: one `@pytest.mark.live` test drafting a Hindi
    description via real Vertex, asserting `in_script` and length (opt-in,
    excluded by default; needs the service-account key).
  - Onboarding's own tests (`test_graph.py`, `test_parsers.py`,
    `test_onboarding_api.py`) are unchanged and still pass — the shared-code
    lift is behaviour-preserving via re-export shims.
- **Mobile:** `npm run check:i18n` (locale-completeness + the hardcoded-
  string guard from Task 6) and `npm run test:i18n` must pass; `npx expo
  lint`. No device build was run as part of this branch's automated
  verification.

## 8. Out of scope

No English copy of the description kept alongside the poster's language;
no translation-on-read for workers viewing a job posted in a language
they don't read (deferred); no in-place editor for the description draft
(accept the draft or redo it — no free-text edit box on the draft card).
