"""HTTP API for the voice job-posting assistant.

POST /v1/job-posting/sessions               {lang?, category?} start → first thing to say
POST /v1/job-posting/sessions/{sid}/turns   {transcript} or {selection} → next thing to say
GET  /v1/job-posting/sessions/{sid}         last thing said (resume)
"""

from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from app.agents.job_posting.state import KIND, filled, initial_state
from app.auth import current_user
from app.errors import ServiceError
from app.sessions import StartIn, TurnIn, _now, config_for, load_session, session_lock

router = APIRouter(prefix="/v1/job-posting")


class JobStartIn(StartIn):
    category: str | None = Field(default=None, max_length=64)  # a known slug, else ignored


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


@router.post("/sessions", status_code=201)
async def start_session(
    request: Request, body: JobStartIn | None = None, user: dict = Depends(current_user)
):
    request.app.state.limiter.check(str(user["id"]))
    sid = uuid4().hex
    lang = body.lang if body else None
    category = body.category if body else None
    state = initial_state(user, now=_now(), lang=lang, category=category)
    catalog = await request.app.state.catalogs.get(state["lang"])
    if state["category"] not in catalog.slugs:
        state["category"] = None
    state = {**state, "turn": {"kind": "start"}}
    values = await request.app.state.job_graph.ainvoke(state, config_for(sid))
    return {"sessionId": sid, **_output(values)}


@router.post("/sessions/{sid}/turns")
async def take_turn(sid: str, body: TurnIn, request: Request, user: dict = Depends(current_user)):
    request.app.state.limiter.check(str(user["id"]))
    lock = session_lock(sid)
    if lock.locked():
        raise ServiceError(409, "Still working on your last answer.", "busy")
    async with lock:
        values = await load_session(request.app.state.job_graph, sid, user, kind=KIND)
        if values.get("done") or values.get("handoff"):
            raise ServiceError(409, "This conversation is already finished.", "finished")
        # Fetch the catalogue first: if the backend is down we fail here,
        # before the graph has changed anything.
        await request.app.state.catalogs.get(values["lang"])
        if body.transcript is not None:
            turn = {"kind": "speech", "transcript": body.transcript}
        else:
            turn = {"kind": "tap", "selection": body.selection}
        values = await request.app.state.job_graph.ainvoke({"turn": turn}, config_for(sid))
    return _output(values)


@router.get("/sessions/{sid}")
async def get_session(sid: str, request: Request, user: dict = Depends(current_user)):
    return _output(await load_session(request.app.state.job_graph, sid, user, kind=KIND))
