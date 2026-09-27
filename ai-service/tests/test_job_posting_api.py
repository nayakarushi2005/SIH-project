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
    node.get("/categories").mock(
        side_effect=lambda req: httpx.Response(200, json=EN_PAYLOAD if req.url.params["lang"] == "en" else LANG_PAYLOAD)
    )
    return node


async def start(client, **body):
    res = await client.post("/v1/job-posting/sessions", headers=H, json=body or None)
    assert res.status_code == 201
    return res.json()


async def to_done(client, sid):
    """Drive a session (already at `description`) all the way to `done` via taps."""
    await client.post(
        f"/v1/job-posting/sessions/{sid}/turns",
        headers=H,
        json={"selection": {"description": "Kitchen tap is leaking badly near the pipe."}},
    )
    await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"selection": {"yes": True}})
    await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"selection": {"price": 500}})
    await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"selection": {"durationMins": 120}})
    await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"selection": {"skip": True}})
    return await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"selection": {"yes": True}})


async def test_start_speaks_hindi_by_default(client, node_ok):
    body = await start(client)
    assert body["lang"] == "hi" and body["step"] == "category"


async def test_start_uses_the_language_the_app_is_in(client, node_ok):
    body = await start(client, lang="ta")
    assert body["lang"] == "ta"


async def test_unknown_category_is_ignored(client, node_ok):
    body = await start(client, category="not-a-real-category")
    assert body["step"] == "category"
    assert body["filled"]["category"] is None


async def test_known_category_starts_at_description(client, node_ok):
    body = await start(client, category="plumber")
    assert body["step"] == "description"
    assert body["filled"]["category"] == "plumber"


async def test_speech_turn_advances(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(
        f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"transcript": "प्लंबर चाहिए"}
    )
    body = res.json()
    assert body["step"] == "description" and body["filled"]["category"] == "plumber"


async def test_get_resumes_with_the_same_speak(client, node_ok):
    sid = (await start(client))["sessionId"]
    turn = await client.post(
        f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"transcript": "प्लंबर चाहिए"}
    )
    again = await client.get(f"/v1/job-posting/sessions/{sid}", headers=H)
    assert again.json()["step"] == turn.json()["step"] == "description"
    assert again.json()["speak"] == turn.json()["speak"]


async def test_other_users_cannot_use_a_session(client, node_ok):
    sid = (await start(client))["sessionId"]
    res = await client.post(
        f"/v1/job-posting/sessions/{sid}/turns",
        headers={"Authorization": "Bearer u2"},
        json={"transcript": "x"},
    )
    assert res.status_code == 403


async def test_turn_after_done_is_409(client, node_ok):
    sid = (await start(client, category="plumber"))["sessionId"]
    done = await to_done(client, sid)
    assert done.json()["done"] is True
    res = await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"transcript": "हाँ"})
    assert res.status_code == 409 and res.json()["code"] == "finished"


async def test_a_turn_while_another_is_running_is_409(client, node_ok):
    sid = (await start(client))["sessionId"]
    from app.sessions import session_lock

    lock = session_lock(sid)
    await lock.acquire()
    try:
        res = await client.post(
            f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"transcript": "प्लंबर चाहिए"}
        )
        assert res.status_code == 409 and res.json()["code"] == "busy"
    finally:
        lock.release()


async def test_onboarding_session_on_job_route_is_404(client, node_ok):
    node_ok.get("/federations/nearby").mock(
        return_value=httpx.Response(400, json={"error": "x", "code": "no_location"})
    )
    res = await client.post("/v1/onboarding/sessions", headers=H)
    sid = res.json()["sessionId"]
    turn = await client.post(f"/v1/job-posting/sessions/{sid}/turns", headers=H, json={"transcript": "x"})
    assert turn.status_code == 404


async def test_job_session_on_onboarding_route_is_404(client, node_ok):
    sid = (await start(client))["sessionId"]
    turn = await client.post(f"/v1/onboarding/sessions/{sid}/turns", headers=H, json={"transcript": "x"})
    assert turn.status_code == 404
