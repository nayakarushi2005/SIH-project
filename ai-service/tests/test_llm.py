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
