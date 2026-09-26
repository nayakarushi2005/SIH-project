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

## Test

```bash
pytest              # unit + conversation tests (no network, no key needed)
ruff check .        # lint
pytest -m live      # one real Vertex AI call — needs the key
```
