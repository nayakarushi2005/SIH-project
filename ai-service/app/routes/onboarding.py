"""HTTP API for the voice onboarding assistant.

POST /v1/onboarding/sessions               {lang?} start → first thing to say
POST /v1/onboarding/sessions/{sid}/turns   {transcript} or {selection} → next thing to say
GET  /v1/onboarding/sessions/{sid}         last thing said (resume)
"""

import asyncio
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, model_validator

from app.agents.onboarding.graph import build_graph
from app.agents.onboarding.state import filled, initial_state
from app.auth import current_user
from app.checkpoint import SESSION_TTL_S
from app.errors import ServiceError
from app.node_client import get_node

router = APIRouter(prefix="/v1/onboarding")


def _now() -> float:
    return time.time()


# One turn at a time per conversation: a second request while one is running
# (double tap, retry) gets 409 instead of racing and losing an answer.
_locks: dict[str, asyncio.Lock] = {}


def session_lock(sid: str) -> asyncio.Lock:
    if len(_locks) > 10_000:  # drop idle locks
        for key in [k for k, lock in _locks.items() if not lock.locked()]:
            del _locks[key]
    return _locks.setdefault(sid, asyncio.Lock())


class StartIn(BaseModel):
    lang: str | None = Field(default=None, max_length=10)  # the app's current language


class TurnIn(BaseModel):
    transcript: str | None = Field(default=None, max_length=500)
    selection: dict | None = None

    @model_validator(mode="after")
    def exactly_one(self):
        if (self.transcript is None) == (self.selection is None):
            raise ValueError("Send either transcript or selection.")
        return self


def _config(sid: str) -> dict:
    return {"configurable": {"thread_id": sid}}


def _output(values: dict) -> dict:
    return {
        "speak": values.get("speak", ""),
        "ui": values.get("ui"),
        "step": values.get("step"),
        "done": bool(values.get("done")),
        "handoff": bool(values.get("handoff")),
        "filled": filled(values),
        "lang": values.get("lang"),
    }


async def _load(request: Request, sid: str, user: dict) -> dict:
    snapshot = await request.app.state.graph.aget_state(_config(sid))
    values = snapshot.values if snapshot else None
    if not values or _now() - values.get("created_at", 0) > SESSION_TTL_S:
        raise ServiceError(404, "This conversation has ended. Please start again.", "not_found")
    if values.get("owner") != str(user["id"]):
        raise ServiceError(403, "This conversation belongs to someone else.", "forbidden")
    return values


@router.post("/sessions", status_code=201)
async def start_session(
    request: Request, body: StartIn | None = None, user: dict = Depends(current_user)
):
    request.app.state.limiter.check(str(user["id"]))
    try:
        nearby = await get_node(request).get_nearby_federations(user["_token"])
        options = nearby.get("federations", [])
    except ServiceError:
        options = []  # no location / backend hiccup → skip the federation step
    sid = uuid4().hex
    lang = body.lang if body else None
    state = {**initial_state(user, options, now=_now(), lang=lang), "turn": {"kind": "start"}}
    await request.app.state.catalogs.get(state["lang"])
    values = await request.app.state.graph.ainvoke(state, _config(sid))
    return {"sessionId": sid, **_output(values)}


@router.post("/sessions/{sid}/turns")
async def take_turn(sid: str, body: TurnIn, request: Request, user: dict = Depends(current_user)):
    request.app.state.limiter.check(str(user["id"]))
    lock = session_lock(sid)
    if lock.locked():
        raise ServiceError(409, "Still working on your last answer.", "busy")
    async with lock:
        values = await _load(request, sid, user)
        if values.get("done") or values.get("handoff"):
            raise ServiceError(409, "This conversation is already finished.", "finished")
        # Fetch the catalogue first: if the backend is down we fail here,
        # before the graph has changed anything.
        await request.app.state.catalogs.get(values["lang"])
        if body.transcript is not None:
            turn = {"kind": "speech", "transcript": body.transcript}
        else:
            turn = {"kind": "tap", "selection": body.selection}
        values = await request.app.state.graph.ainvoke({"turn": turn}, _config(sid))
    return _output(values)


@router.get("/sessions/{sid}")
async def get_session(sid: str, request: Request, user: dict = Depends(current_user)):
    return _output(await _load(request, sid, user))


def rebuild_graph_for_tests(app) -> None:
    """A fresh graph over the same checkpointer — like a service restart."""
    app.state.graph = build_graph(
        app.state.extractor, app.state.catalogs.get, app.state.checkpointer
    )
