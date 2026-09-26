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
            raise ServiceError(
                401, "Your session has expired. Please sign in again.", "unauthorized"
            )
        if res.status_code >= 500:
            raise ServiceError(503, UNAVAILABLE, "backend_unavailable")
        if res.status_code >= 400:
            body = _json(res)
            message = body.get("error", "Request failed.")
            raise ServiceError(res.status_code, message, body.get("code"))
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
