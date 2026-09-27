"""Shared session plumbing for the voice conversation routes (onboarding,
job posting, ...): the per-conversation lock, the request bodies every
route accepts, and loading a conversation's state from the checkpointer.
"""

import asyncio
import time

from pydantic import BaseModel, Field, model_validator

from app.checkpoint import SESSION_TTL_S
from app.errors import ServiceError


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


def config_for(sid: str) -> dict:
    return {"configurable": {"thread_id": sid}}


async def load_session(graph, sid: str, user: dict, kind: str | None = None) -> dict:
    """The conversation's current state, checked against `sid`, TTL, `kind`
    (onboarding sessions have none; job-posting ones do, so a session id from
    one flow used on the other's route 404s) and ownership.

    Different flows share one checkpointer (so a restart rebuilds every graph
    over the same store), but each flow's graph only declares its own state's
    fields, and `graph.aget_state()` filters a checkpoint down to the fields
    the *calling* graph declares — so a job-posting checkpoint read through
    the onboarding graph silently loses its `kind`. Read the checkpoint
    itself instead, so the `kind` check actually sees it.
    """
    checkpoint_tuple = await graph.checkpointer.aget_tuple(config_for(sid))
    values = checkpoint_tuple.checkpoint.get("channel_values") if checkpoint_tuple else None
    if not values or _now() - values.get("created_at", 0) > SESSION_TTL_S:
        raise ServiceError(404, "This conversation has ended. Please start again.", "not_found")
    if values.get("kind") != kind:
        raise ServiceError(404, "This conversation has ended. Please start again.", "not_found")
    if values.get("owner") != str(user["id"]):
        raise ServiceError(403, "This conversation belongs to someone else.", "forbidden")
    return values
