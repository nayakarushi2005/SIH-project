import httpx
import pytest
import respx

from app.config import Settings
from app.main import create_app

NODE = "http://node.test/api"


@pytest.fixture
def settings():
    return Settings(node_api_url=NODE, _env_file=None)


@pytest.fixture
async def app(settings):
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ai.test") as c:
        yield c


@pytest.fixture
def node():
    with respx.mock(base_url=NODE, assert_all_called=False) as mock:
        yield mock


@pytest.fixture(autouse=True)
def _clear_auth_cache():
    from app import auth

    auth._cache.clear()
    yield
    auth._cache.clear()
