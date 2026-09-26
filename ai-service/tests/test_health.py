async def test_health_without_vertex_or_mongo(client):
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vertexConfigured"] is False
    assert body["model"] == "gemini-3.8-flash"
