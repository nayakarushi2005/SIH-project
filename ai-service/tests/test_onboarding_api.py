import httpx
import pytest

from tests.fakes import EN_PAYLOAD, LANG_PAYLOAD

H = {"Authorization": "Bearer u1"}


@pytest.fixture
def node_ok(node):
    def me(req):
        uid = req.headers["Authorization"].split()[1]
        return httpx.Response(200, json={"id": uid, "preferredLanguage": "hi", "isAadhaarVerified": True, "name": "Sita"})

    node.get("/auth/me").mock(side_effect=me)
    node.get("/federations/nearby").mock(return_value=httpx.Response(400, json={"error": "x", "code": "no_location"}))
    node.get("/categories").mock(
        side_effect=lambda req: httpx.Response(200, json=EN_PAYLOAD if req.url.params["lang"] == "en" else LANG_PAYLOAD)
    )
    return node


async def start(client):
    res = await client.post("/v1/onboarding/sessions", headers=H)
    assert res.status_code == 201
    return res.json()


async def test_start_speaks_hindi_and_skips_name_for_verified(client, node_ok):
    body = await start(client)
    assert body["lang"] == "hi" and body["step"] == "income"
    assert body["filled"]["name"] == "Sita"


async def test_turns_progress_and_get_resumes(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers=H, json={"transcript": "2 लाख साल"})
    assert res.json()["step"] == "categories"
    again = await client.get(f"/v1/onboarding/sessions/{sid}", headers=H)
    assert again.json()["step"] == "categories" and again.json()["speak"] == res.json()["speak"]


async def test_other_users_cannot_use_a_session(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers={"Authorization": "Bearer u2"}, json={"transcript": "x"})
    assert res.status_code == 403


async def test_unknown_session_is_404(client, node_ok):
    res = await client.get("/v1/onboarding/sessions/nope", headers=H)
    assert res.status_code == 404


async def test_long_transcript_is_422(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers=H, json={"transcript": "a" * 501})
    assert res.status_code == 422


async def test_needs_exactly_one_of_transcript_or_selection(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers=H, json={})
    assert res.status_code == 422


async def test_expired_session_is_404(client, node_ok, monkeypatch):
    sid = (await start(client))["sessionId"]
    import app.routes.onboarding as r

    monkeypatch.setattr(r, "_now", lambda: 10**12)
    res = await client.get(f"/v1/onboarding/sessions/{sid}", headers=H)
    assert res.status_code == 404


async def test_rate_limit(client, node_ok, app):
    from app.ratelimit import RateLimiter

    app.state.limiter = RateLimiter(limit=2, window_s=60)
    sid = (await start(client))["sessionId"]
    codes = [
        (await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers=H, json={"transcript": "hmm"})).status_code
        for _ in range(3)
    ]
    assert codes[-1] == 429


async def test_session_survives_graph_rebuild_with_same_saver(client, node_ok, app):
    sid = (await start(client))["sessionId"]
    from app.routes.onboarding import rebuild_graph_for_tests

    rebuild_graph_for_tests(app)  # new graph object, same checkpointer
    res = await client.get(f"/v1/onboarding/sessions/{sid}", headers=H)
    assert res.json()["step"] == "income"
