from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def raise_api_error(
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict | list | str | None = None,
) -> None:
    payload = {"code": code, "message": message}
    if details is not None:
        payload["details"] = details
    raise HTTPException(status_code=status_code, detail=payload)


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        payload = {"error": exc.detail}
    else:
        payload = {
            "error": {
                "code": "http_error",
                "message": str(exc.detail),
            }
        }
    return JSONResponse(status_code=exc.status_code, content=payload)


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    payload = {
        "error": {
            "code": "validation_error",
            "message": "Request validation failed",
            "details": exc.errors(),
        }
    }
    return JSONResponse(status_code=422, content=payload)
