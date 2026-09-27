import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from the environment or ai-service/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    node_api_url: str = "http://localhost:3000/api"
    mongodb_uri: str | None = None

    google_cloud_project: str | None = None
    google_cloud_location: str = "asia-south1"
    google_application_credentials: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    llm_timeout_s: float = 20.0

    log_level: str = "INFO"
    cors_origins: list[str] = []

    _cached_key_project: str | None = None
    _key_project_loaded: bool = False

    @property
    def effective_project(self) -> str | None:
        """`google_cloud_project`, or the `project_id` in the service-account key
        file when that's unset — so GOOGLE_CLOUD_PROJECT is optional when the key
        file already names the project."""
        if self.google_cloud_project:
            return self.google_cloud_project
        if not self._key_project_loaded:
            self._key_project_loaded = True
            self._cached_key_project = self._read_key_project()
        return self._cached_key_project

    def _read_key_project(self) -> str | None:
        if not self.google_application_credentials:
            return None
        key = Path(self.google_application_credentials).expanduser()
        if not key.is_file():
            return None
        try:
            data = json.loads(key.read_text("utf-8"))
        except (OSError, ValueError):
            return None
        # A key file that is valid JSON but not an object (or names a
        # non-string project) must not crash startup: fall back to "no project".
        pid = data.get("project_id") if isinstance(data, dict) else None
        return pid if isinstance(pid, str) and pid.strip() else None

    @property
    def vertex_configured(self) -> bool:
        return bool(self.effective_project and self.google_application_credentials)


@lru_cache
def get_settings() -> Settings:
    return Settings()
