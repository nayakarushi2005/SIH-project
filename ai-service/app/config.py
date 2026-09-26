from functools import lru_cache

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

    @property
    def vertex_configured(self) -> bool:
        return bool(self.google_cloud_project and self.google_application_credentials)


@lru_cache
def get_settings() -> Settings:
    return Settings()
