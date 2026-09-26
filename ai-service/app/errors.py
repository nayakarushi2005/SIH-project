from fastapi import Request
from fastapi.responses import JSONResponse


class ServiceError(Exception):
    """An error with a status code and a message safe to show the app."""

    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    body = {"error": exc.message}
    if exc.code:
        body["code"] = exc.code
    return JSONResponse(status_code=exc.status, content=body)
