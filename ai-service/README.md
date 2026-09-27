# AI service

Python layer for the app's AI features (LangGraph agents on Vertex AI
Gemini). Runs locally in a virtual environment — no Docker.

## Setup (once)

```bash
brew install python@3.12            # the service needs Python 3.11+
cd ai-service
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                # then fill it in
```

Vertex AI uses a **service-account key**, never an API key:

1. Put the JSON key at `ai-service/keys/vertex-service-account.json`
   (`keys/` is gitignored).
2. In `.env` set `GOOGLE_CLOUD_PROJECT` to the project that has the
   Vertex AI API enabled, and `GOOGLE_APPLICATION_CREDENTIALS` to the key path.
3. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; `GOOGLE_CLOUD_LOCATION`
   to `asia-south1`.

`NODE_API_URL` must point at the Node backend (`http://localhost:3000/api`
when both run on your laptop). The service checks every request's bearer
token by calling the backend's `/auth/me`, so it needs no JWT secret.

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
curl localhost:8000/health
```

`--host 0.0.0.0` lets a phone on the same Wi-Fi reach it.

## API

Two voice-conversation flows, each a LangGraph state machine checkpointed
per session (in Mongo when `MONGODB_URI` is set, otherwise in memory for
local dev). Every route needs the app's bearer token; the service checks it
against the backend's `/auth/me`. A conversation runs one turn per request:
the client speaks or taps, the service answers with the next thing to say.

```
POST /v1/onboarding/sessions               {lang?} start → first thing to say
POST /v1/onboarding/sessions/{sid}/turns   {transcript} or {selection} → next thing to say
GET  /v1/onboarding/sessions/{sid}         last thing said (resume)

POST /v1/job-posting/sessions              {lang?, category?} start → first thing to say
POST /v1/job-posting/sessions/{sid}/turns  {transcript} or {selection} → next thing to say
GET  /v1/job-posting/sessions/{sid}        last thing said (resume)
```

Every response has the same shape: `{ speak, ui, step, done, handoff, filled,
lang }` (plus `sessionId` on start). `filled` is the running draft of what
the flow has collected so far; the app renders it as the form fills in and
uses it once `done` is true.

The job-posting flow: the app opens a session (passing a `category` slug
when the user tapped a specific service first, or none to ask by voice),
then exchanges turns until `done`. `filled` at that point has `category`,
`description`, `price`, `expectedDurationMins`, `address` and `language`.
The app still has to collect a photo itself — the voice flow never asks for
one — before calling the backend's `POST /api/jobs` with those fields plus
`language` and `postedVia: "voice"` (a normal, form-filled post sends
`postedVia: "form"` instead, and no `language` override).

A session id only works on the flow that created it: an onboarding session
id on a `/v1/job-posting/...` route (or vice versa) is a 404, same as an
unknown or expired one.

## Test

```bash
pytest              # unit + conversation tests (no network, no key needed)
ruff check .        # lint
pytest -m live      # one real Vertex AI call — needs the key
```
