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
