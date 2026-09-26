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
