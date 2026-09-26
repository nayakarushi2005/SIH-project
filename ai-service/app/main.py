import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.errors import ServiceError, service_error_handler


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.http = httpx.AsyncClient(base_url=settings.node_api_url, timeout=10.0)
        try:
            yield
        finally:
            await app.state.http.aclose()

    app = FastAPI(title="SIH AI service", lifespan=lifespan)
    app.add_exception_handler(ServiceError, service_error_handler)
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
