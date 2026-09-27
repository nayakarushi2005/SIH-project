import json

from app.config import Settings


def test_effective_project_falls_back_to_key_file(tmp_path):
    key = tmp_path / "vertex-key.json"
    key.write_text(json.dumps({"type": "service_account", "project_id": "my-gcp-project"}))
    settings = Settings(google_cloud_project=None, google_application_credentials=str(key))
    assert settings.effective_project == "my-gcp-project"
    assert settings.vertex_configured is True


def test_effective_project_prefers_explicit_setting(tmp_path):
    key = tmp_path / "vertex-key.json"
    key.write_text(json.dumps({"project_id": "from-key-file"}))
    settings = Settings(google_cloud_project="explicit-project", google_application_credentials=str(key))
    assert settings.effective_project == "explicit-project"


def test_effective_project_none_without_project_or_key():
    settings = Settings(google_cloud_project=None, google_application_credentials=None)
    assert settings.effective_project is None
    assert settings.vertex_configured is False


def test_vertex_not_configured_without_credentials_path():
    settings = Settings(google_cloud_project=None, google_application_credentials=None)
    assert settings.effective_project is None
    assert settings.vertex_configured is False


def test_key_file_that_is_not_a_json_object_is_ignored(tmp_path):
    for body in ("[1, 2]", '"a string"', "42", "null"):
        key = tmp_path / "vertex-key.json"
        key.write_text(body)
        settings = Settings(google_cloud_project=None, google_application_credentials=str(key))
        assert settings.effective_project is None
        assert settings.vertex_configured is False


def test_key_file_with_non_string_or_empty_project_id_is_ignored(tmp_path):
    for pid in (123, None, "", "   ", ["p"], {"id": "p"}):
        key = tmp_path / "vertex-key.json"
        key.write_text(json.dumps({"project_id": pid}))
        settings = Settings(google_cloud_project=None, google_application_credentials=str(key))
        assert settings.effective_project is None
