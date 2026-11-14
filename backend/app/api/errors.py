"""Errores HTTP estructurados: ``{code, message, field, details}`` (plan §6.2)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("nutriruta.api")


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        field: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        self.details = details


def error_body(code: str, message: str, field: str | None = None, details: Any = None) -> dict:
    return {"code": code, "message": message, "field": field, "details": details}


def _field_path(location: tuple | list) -> str:
    parts: list[str] = []
    for item in location:
        if item in ("body", "query", "path") and not parts:
            continue
        if isinstance(item, int):
            parts[-1:] = [f"{parts[-1]}[{item}]"] if parts else [f"[{item}]"]
        else:
            parts.append(str(item))
    return ".".join(parts)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.field, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": _field_path(err.get("loc", ())),
                "message": err.get("msg"),
                "type": err.get("type"),
            }
            for err in exc.errors()
        ]
        first = details[0] if details else {"field": None, "message": "solicitud inválida"}
        extra = [d for d in details if d["type"] == "extra_forbidden"]
        message = (
            f"Campo no permitido: «{extra[0]['field']}». Solo se aceptan campos institucionales; "
            "los datos personales (DNI, nombres de personas, sexo) no se reciben."
            if extra
            else f"Solicitud inválida en «{first['field']}»: {first['message']}"
        )
        return JSONResponse(
            status_code=422,
            content=error_body("VALIDATION_ERROR", message, first["field"], details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 413: "PAYLOAD_TOO_LARGE"}.get(
            exc.status_code, "HTTP_ERROR"
        )
        return JSONResponse(status_code=exc.status_code, content=error_body(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error no controlado: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=error_body(
                "INTERNAL_ERROR", "Ocurrió un error interno. Revise el log del servidor."
            ),
        )
