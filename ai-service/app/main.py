import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.onboarding.catalog import CatalogCache
from app.agents.onboarding.extract import GeminiExtractor, NullExtractor
from app.agents.onboarding.graph import build_graph
from app.checkpoint import make_checkpointer
from app.config import Settings, get_settings
from app.errors import ServiceError, service_error_handler
from app.llm import ConfigError, make_chat_model
from app.node_client import NodeClient
from app.ratelimit import RateLimiter
from app.routes.onboarding import router as onboarding_router

log = logging.getLogger(__name__)


def make_extractor(settings: Settings):
    """Gemini when Vertex AI is configured; otherwise rules only."""
    if not settings.vertex_configured:
        log.warning("Vertex AI not configured: onboarding runs on rule-based parsing only")
        return NullExtractor()
    try:
        return GeminiExtractor(make_chat_model(settings), settings.llm_timeout_s)
    except ConfigError as err:
        log.warning("Vertex AI misconfigured (%s): rule-based parsing only", err)
        return NullExtractor()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.http = httpx.AsyncClient(base_url=settings.node_api_url, timeout=10.0)
        app.state.checkpointer, close_checkpointer = make_checkpointer(settings)
        app.state.extractor = make_extractor(settings)
        app.state.catalogs = CatalogCache(NodeClient(app.state.http))
        app.state.graph = build_graph(
            app.state.extractor, app.state.catalogs.get, app.state.checkpointer
        )
        app.state.limiter = RateLimiter()
        try:
            yield
        finally:
            await app.state.http.aclose()
            close_checkpointer()

    app = FastAPI(title="SIH AI service", lifespan=lifespan)
    app.add_exception_handler(ServiceError, service_error_handler)
    app.include_router(onboarding_router)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "model": settings.gemini_model,
            "vertexConfigured": settings.vertex_configured,
        }

    return app


app = create_app()
