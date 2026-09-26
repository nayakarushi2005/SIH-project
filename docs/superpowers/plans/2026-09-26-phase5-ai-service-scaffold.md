# Phase 5 — AI Service Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Python service (`ai-service/`, FastAPI in a venv) that authenticates app users, talks to the Node backend, and can build a Vertex AI Gemini chat model — the foundation the Phase 6 onboarding agent plugs into.

**Architecture:** FastAPI app with a lifespan that owns one `httpx.AsyncClient` to the Node API and (optionally) one PyMongo async client for LangGraph checkpoints. Auth forwards the app's bearer token to Node `GET /api/auth/me` (short TTL cache) — Node stays the single source of truth for users, so the Python service needs neither the JWT secret nor user-collection access. The Gemini model is built lazily from settings (`ChatGoogleGenerativeAI(vertexai=True)`, service-account key via `GOOGLE_APPLICATION_CREDENTIALS`), so the service and all tests run before the key exists.

**Tech Stack:** Python 3.12 (Homebrew), FastAPI, Uvicorn, pydantic-settings, httpx, LangGraph 1.x, langchain-google-genai 4.x, langgraph-checkpoint-mongodb, PyMongo, pytest + pytest-asyncio + respx, ruff.

**Spec:** `docs/superpowers/specs/2026-09-26-worker-onboarding-agent-design.md` (§7.1, §7.2 health, Phase 5)

## Global Constraints

- Runs locally in `ai-service/.venv`; **no Docker** (product-owner decision).
- Port 8000. Config only from env / `ai-service/.env` (gitignored); `.env.example` committed.
- Vertex auth: `GOOGLE_APPLICATION_CREDENTIALS` → service-account JSON, gitignored (`ai-service/keys/`). Region default `asia-south1`. Model from `GEMINI_MODEL`, default `gemini-3.8-flash` (latest GA Flash on Vertex, 2026-09); temperature 0.
- No network calls at import time or in tests (Node mocked with respx, LLM never constructed in tests unless faked).
- `ruff check` clean, `pytest` green.

## Deviation from spec (recorded)

Spec §7.1 said `auth.py` verifies the JWT with a shared secret and reads the user from Mongo. This plan instead validates by calling Node `/api/auth/me` with the same bearer token. Same guarantees (Node already verifies signature, expiry, `isActive`), no duplicated auth logic, no secret sharing, and the service gets exactly the profile shape the app sees (`preferredLanguage`, `isAadhaarVerified`, `name`, `pincode`, `worker`, …). Cost: one extra local HTTP hop per request, mitigated by a 30 s cache keyed by token.

## Review Focus

1. Missing / malformed `Authorization` header → 401 without calling Node. Test in Task 2.
2. Node returns 401 (expired token) → 401; Node unreachable / 5xx / timeout → 503, never 500 with a stack. Test in Task 2.
3. Cache must not leak one user's profile to another token, and must expire. Test in Task 2.
4. `make_chat_model` with no `GOOGLE_CLOUD_PROJECT` → clear `ConfigError`, not a Google SDK traceback at request time. Test in Task 3.
5. `/health` works with no Vertex key and no Mongo configured. Test in Task 1.

---

## File Structure

```
ai-service/
  README.md               setup + run + test
  requirements.txt        pinned deps
  pyproject.toml          ruff + pytest config
  .env.example
  .gitignore              .venv, .env, keys/, __pycache__
  app/
    __init__.py
    main.py               create_app(), lifespan, /health
    config.py             Settings (pydantic-settings), get_settings()
    node_client.py        NodeClient: get_me, get_categories, get_nearby_federations
    auth.py               current_user dependency, TTL cache
    llm.py                make_chat_model(settings), ConfigError
    errors.py             ServiceError → JSON handler
  tests/
    conftest.py           settings override, app + client fixtures, respx
    test_health.py
    test_auth.py
    test_llm.py
```

---

### Task 1: Project skeleton, settings, health

**Files:** everything under `ai-service/` except `node_client.py`, `auth.py`, `llm.py` and their tests.

**Interfaces:**
- Produces: `Settings` fields `node_api_url: str = "http://localhost:3000/api"`, `mongodb_uri: str | None = None`, `google_cloud_project: str | None`, `google_cloud_location: str = "asia-south1"`, `google_application_credentials: str | None`, `gemini_model: str = "gemini-3.8-flash"`, `llm_timeout_s: float = 20`, `log_level: str = "INFO"`, `cors_origins: list[str] = []`; `get_settings()` (lru_cache); `create_app(settings: Settings | None = None) -> FastAPI`; `app.state.settings`, `app.state.http` (httpx.AsyncClient); `GET /health → {"status": "ok", "model": settings.gemini_model, "vertexConfigured": bool}`.

- [ ] **Step 1: Python 3.12 + venv**

```bash
brew install python@3.12
cd ai-service
python3.12 -m venv .venv
source .venv/bin/activate
```

- [ ] **Step 2: `requirements.txt`** (pin to the versions `pip install` resolves today, then freeze the top-level ones):

```
fastapi>=0.141,<1
uvicorn[standard]>=0.35
pydantic-settings>=2.10
httpx>=0.28
langgraph>=1.2,<2
langchain-core>=1.0
langchain-google-genai>=4.4,<5
langgraph-checkpoint-mongodb>=0.5
pymongo>=4.13
rapidfuzz>=3.13
# dev
pytest>=8.4
pytest-asyncio>=1.1
respx>=0.22
ruff>=0.12
```

`pip install -r requirements.txt`, then replace each `>=` line with the exact installed version from `pip freeze` (keep comments).

- [ ] **Step 3: `pyproject.toml`**

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "ASYNC"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
markers = ["live: calls real Vertex AI (needs credentials); run with -m live"]
addopts = "-m 'not live'"
```

- [ ] **Step 4: Failing test** — `tests/test_health.py`

```python
async def test_health_without_vertex_or_mongo(client):
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vertexConfigured"] is False
    assert body["model"] == "gemini-3.8-flash"
```

`tests/conftest.py`:

```python
import httpx
import pytest
import respx

from app.config import Settings
from app.main import create_app

NODE = "http://node.test/api"


@pytest.fixture
def settings():
    return Settings(node_api_url=NODE, _env_file=None)


@pytest.fixture
async def app(settings):
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ai.test") as c:
        yield c


@pytest.fixture
def node():
    with respx.mock(base_url=NODE, assert_all_called=False) as mock:
        yield mock
```

Run `pytest` → FAIL (no `app`).

- [ ] **Step 5: Implement** — `app/config.py`:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from the environment or ai-service/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    node_api_url: str = "http://localhost:3000/api"
    mongodb_uri: str | None = None

    google_cloud_project: str | None = None
    google_cloud_location: str = "asia-south1"
    google_application_credentials: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    llm_timeout_s: float = 20.0

    log_level: str = "INFO"
    cors_origins: list[str] = []

    @property
    def vertex_configured(self) -> bool:
        return bool(self.google_cloud_project and self.google_application_credentials)


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`app/errors.py`:

```python
from fastapi import Request
from fastapi.responses import JSONResponse


class ServiceError(Exception):
    """An error with a status code and a message safe to show the app."""

    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    body = {"error": exc.message}
    if exc.code:
        body["code"] = exc.code
    return JSONResponse(status_code=exc.status, content=body)
```

`app/main.py`:

```python
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.errors import ServiceError, service_error_handler


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.http = httpx.AsyncClient(base_url=settings.node_api_url, timeout=10.0)
        try:
            yield
        finally:
            await app.state.http.aclose()

    app = FastAPI(title="SIH AI service", lifespan=lifespan)
    app.add_exception_handler(ServiceError, service_error_handler)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "model": settings.gemini_model,
            "vertexConfigured": settings.vertex_configured,
        }

    return app


app = create_app()
```

Plus `app/__init__.py` (empty), `.gitignore` (`.venv/`, `.env`, `keys/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`), `.env.example`:

```
NODE_API_URL=http://localhost:3000/api
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<db>
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=asia-south1
GOOGLE_APPLICATION_CREDENTIALS=./keys/vertex-service-account.json
GEMINI_MODEL=gemini-3.8-flash
LOG_LEVEL=INFO
```

and `README.md` (setup: brew python@3.12, venv, `pip install -r requirements.txt`, copy `.env.example`, put the key in `ai-service/keys/`, run `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`, test `pytest`, lint `ruff check .`, live smoke `pytest -m live`).

- [ ] **Step 6: Run — PASS**: `pytest && ruff check .`
- [ ] **Step 7: Commit** — `git commit -m "ai-service: FastAPI skeleton, settings and health check"`

---

### Task 2: Node client and auth dependency

**Files:** Create `app/node_client.py`, `app/auth.py`, `tests/test_auth.py`.

**Interfaces:**
- Produces: `NodeClient(http: httpx.AsyncClient)` with `async get_me(token) -> dict`, `async get_categories(lang: str) -> dict` (calls `/categories?lang=..&withSynonyms=1`), `async get_nearby_federations(token) -> dict`; raises `ServiceError(401, …, "unauthorized")` on Node 401/403, `ServiceError(503, …, "backend_unavailable")` on connect errors / timeouts / 5xx, re-raises Node 4xx bodies as `ServiceError(status, body.error, body.code)`. `get_node(request) -> NodeClient`. `current_user(request) -> dict` FastAPI dependency (adds `"_token"` to the returned dict for downstream Node calls); `AUTH_CACHE_TTL_S = 30`.

- [ ] **Step 1: Failing tests** — `tests/test_auth.py`

```python
import httpx
from fastapi import Depends

from app.auth import current_user

ME = {"id": "u1", "name": "Ravi", "preferredLanguage": "hi", "isAadhaarVerified": False}


def add_probe(app):
    @app.get("/probe")
    async def probe(user=Depends(current_user)):
        return {"id": user["id"], "lang": user["preferredLanguage"]}


async def test_missing_header_is_401_without_calling_node(app, client, node):
    add_probe(app)
    route = node.get("/auth/me")
    res = await client.get("/probe")
    assert res.status_code == 401
    assert not route.called


async def test_malformed_header_is_401(app, client, node):
    add_probe(app)
    res = await client.get("/probe", headers={"Authorization": "Token abc"})
    assert res.status_code == 401


async def test_valid_token_returns_user(app, client, node):
    add_probe(app)
    node.get("/auth/me").mock(return_value=httpx.Response(200, json=ME))
    res = await client.get("/probe", headers={"Authorization": "Bearer good"})
    assert res.json() == {"id": "u1", "lang": "hi"}


async def test_node_401_is_401(app, client, node):
    add_probe(app)
    node.get("/auth/me").mock(return_value=httpx.Response(401, json={"error": "Invalid token"}))
    res = await client.get("/probe", headers={"Authorization": "Bearer expired"})
    assert res.status_code == 401


async def test_node_down_is_503(app, client, node):
    add_probe(app)
    node.get("/auth/me").mock(side_effect=httpx.ConnectError("refused"))
    res = await client.get("/probe", headers={"Authorization": "Bearer good"})
    assert res.status_code == 503
    assert res.json()["code"] == "backend_unavailable"


async def test_node_500_is_503(app, client, node):
    add_probe(app)
    node.get("/auth/me").mock(return_value=httpx.Response(500, json={"error": "boom"}))
    res = await client.get("/probe", headers={"Authorization": "Bearer good"})
    assert res.status_code == 503


async def test_cache_is_per_token_and_expires(app, client, node, monkeypatch):
    add_probe(app)
    import app.auth as auth

    now = [1000.0]
    monkeypatch.setattr(auth, "_now", lambda: now[0])
    route = node.get("/auth/me").mock(
        side_effect=lambda req: httpx.Response(
            200, json={**ME, "id": req.headers["Authorization"].split()[1]}
        )
    )
    a = await client.get("/probe", headers={"Authorization": "Bearer A"})
    b = await client.get("/probe", headers={"Authorization": "Bearer B"})
    a2 = await client.get("/probe", headers={"Authorization": "Bearer A"})
    assert (a.json()["id"], b.json()["id"], a2.json()["id"]) == ("A", "B", "A")
    assert route.call_count == 2
    now[0] += auth.AUTH_CACHE_TTL_S + 1
    await client.get("/probe", headers={"Authorization": "Bearer A"})
    assert route.call_count == 3
```

Run → FAIL.

- [ ] **Step 2: Implement** — `app/node_client.py`:

```python
"""Calls to the Node backend, which owns users, categories and federations."""

import httpx
from fastapi import Request

from app.errors import ServiceError

UNAVAILABLE = "The app server is not reachable right now. Please try again."


class NodeClient:
    def __init__(self, http: httpx.AsyncClient):
        self._http = http

    async def _get(self, path: str, token: str | None = None, params: dict | None = None) -> dict:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            res = await self._http.get(path, headers=headers, params=params)
        except httpx.HTTPError as err:  # connect errors, timeouts
            raise ServiceError(503, UNAVAILABLE, "backend_unavailable") from err
        if res.status_code in (401, 403) and path == "/auth/me":
            raise ServiceError(401, "Your session has expired. Please sign in again.", "unauthorized")
        if res.status_code >= 500:
            raise ServiceError(503, UNAVAILABLE, "backend_unavailable")
        if res.status_code >= 400:
            body = _json(res)
            raise ServiceError(res.status_code, body.get("error", "Request failed."), body.get("code"))
        return _json(res)

    async def get_me(self, token: str) -> dict:
        return await self._get("/auth/me", token)

    async def get_categories(self, lang: str) -> dict:
        return await self._get("/categories", params={"lang": lang, "withSynonyms": "1"})

    async def get_nearby_federations(self, token: str) -> dict:
        return await self._get("/federations/nearby", token)


def _json(res: httpx.Response) -> dict:
    try:
        data = res.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def get_node(request: Request) -> NodeClient:
    return NodeClient(request.app.state.http)
```

`app/auth.py`:

```python
"""Who is calling: the app's bearer token, checked by the Node backend."""

import time

from fastapi import Request

from app.errors import ServiceError
from app.node_client import get_node

AUTH_CACHE_TTL_S = 30
_cache: dict[str, tuple[float, dict]] = {}


def _now() -> float:
    return time.monotonic()


def _bearer(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise ServiceError(401, "Please sign in again.", "unauthorized")
    return token.strip()


async def current_user(request: Request) -> dict:
    token = _bearer(request)
    hit = _cache.get(token)
    if hit and _now() - hit[0] < AUTH_CACHE_TTL_S:
        return hit[1]
    user = await get_node(request).get_me(token)
    user = {**user, "_token": token}
    _cache[token] = (_now(), user)
    if len(_cache) > 5000:  # keep memory bounded
        for key, (ts, _) in list(_cache.items()):
            if _now() - ts >= AUTH_CACHE_TTL_S:
                del _cache[key]
    return user
```

Add an autouse fixture in `conftest.py` that clears `app.auth._cache` before each test.

- [ ] **Step 3: Run — PASS**: `pytest && ruff check .`
- [ ] **Step 4: Commit** — `git commit -m "ai-service: authenticate app users through the Node backend"`

---

### Task 3: Vertex AI chat model factory

**Files:** Create `app/llm.py`, `tests/test_llm.py`.

**Interfaces:**
- Produces: `ConfigError(Exception)`; `make_chat_model(settings: Settings) -> BaseChatModel` returning `ChatGoogleGenerativeAI(model=settings.gemini_model, vertexai=True, project=..., location=..., temperature=0, timeout=settings.llm_timeout_s, max_retries=1)`; raises `ConfigError` when `google_cloud_project` is missing or `google_application_credentials` points to a missing file. Sets `os.environ["GOOGLE_APPLICATION_CREDENTIALS"]` from settings when given (google-auth reads it).

- [ ] **Step 1: Failing tests** — `tests/test_llm.py`

```python
import pytest

from app.config import Settings
from app.llm import ConfigError, make_chat_model


def test_missing_project_is_a_config_error():
    with pytest.raises(ConfigError, match="GOOGLE_CLOUD_PROJECT"):
        make_chat_model(Settings(_env_file=None))


def test_missing_key_file_is_a_config_error(tmp_path):
    s = Settings(
        _env_file=None,
        google_cloud_project="p",
        google_application_credentials=str(tmp_path / "nope.json"),
    )
    with pytest.raises(ConfigError, match="not found"):
        make_chat_model(s)


def test_builds_a_vertex_model_without_network(tmp_path, monkeypatch):
    key = tmp_path / "key.json"
    key.write_text("{}")
    captured = {}

    class Fake:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("app.llm.ChatGoogleGenerativeAI", Fake)
    s = Settings(
        _env_file=None, google_cloud_project="proj", google_application_credentials=str(key)
    )
    make_chat_model(s)
    assert captured["vertexai"] is True
    assert captured["project"] == "proj"
    assert captured["location"] == "asia-south1"
    assert captured["model"] == "gemini-3.8-flash"
    assert captured["temperature"] == 0


@pytest.mark.live
def test_live_vertex_says_hello():
    from app.config import get_settings

    reply = make_chat_model(get_settings()).invoke("Reply with the single word: namaste")
    assert "namaste" in reply.content.lower()
```

Run → FAIL.

- [ ] **Step 2: Implement** — `app/llm.py`:

```python
"""The Gemini model on Vertex AI (service-account key, never an API key)."""

import os
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import Settings


class ConfigError(Exception):
    """Vertex AI is not configured; message says what to set."""


def make_chat_model(settings: Settings) -> BaseChatModel:
    if not settings.google_cloud_project:
        raise ConfigError("Set GOOGLE_CLOUD_PROJECT in ai-service/.env to use Vertex AI.")
    if settings.google_application_credentials:
        key = Path(settings.google_application_credentials).expanduser()
        if not key.is_file():
            raise ConfigError(f"Service-account key not found at {key}.")
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(key)
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
        temperature=0,
        timeout=settings.llm_timeout_s,
        max_retries=1,
    )
```

- [ ] **Step 3: Run — PASS**: `pytest && ruff check .` (live test deselected by default).
- [ ] **Step 4: Manual run** — `uvicorn app.main:app --port 8000` then `curl localhost:8000/health` → `{"status":"ok",...}`.
- [ ] **Step 5: Commit** — `git commit -m "ai-service: Vertex AI Gemini model factory"`
