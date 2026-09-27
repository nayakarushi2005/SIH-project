"""The Gemini model on Vertex AI (service-account key, never an API key)."""

import os
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import Settings


class ConfigError(Exception):
    """Vertex AI is not configured; message says what to set."""


def make_chat_model(settings: Settings) -> BaseChatModel:
    if not settings.google_cloud_project:
        raise ConfigError("Set GOOGLE_CLOUD_PROJECT in ai-service/.env to use Vertex AI.")
    if settings.google_application_credentials:
        key = Path(settings.google_application_credentials).expanduser()
        if not key.is_file():
            raise ConfigError(f"Service-account key not found at {key}.")
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(key)
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
        temperature=0,
        timeout=settings.llm_timeout_s,
        max_retries=1,
    )
