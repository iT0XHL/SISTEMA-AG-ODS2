"""Aplicación FastAPI de NutriRuta AG."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.errors import error_body, register_error_handlers
from app.api.routes import experiments, health, imports, runs, scenarios
from app.config import get_settings
from app.storage.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="NutriRuta AG",
        version=__version__,
        description=(
            "Optimizador genético de asignación de lotes alimentarios y rutas de abastecimiento "
            "(ODS 2). Prototipo académico de simulación: no es un sistema oficial de despacho."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def limit_payload(request: Request, call_next):
        """Rechaza cuerpos demasiado grandes antes de leerlos."""
        length = request.headers.get("content-length")
        if length and length.isdigit():
            is_upload = request.url.path.startswith("/api/v1/imports/")
            limit = (
                (settings.max_upload_bytes + 64 * 1024) if is_upload else settings.max_json_bytes
            )
            if int(length) > limit:
                return JSONResponse(
                    status_code=413,
                    content=error_body(
                        "PAYLOAD_TOO_LARGE",
                        "La solicitud supera el tamaño máximo permitido "
                        f"({settings.max_upload_mb:g} MB para archivos, "
                        f"{settings.max_json_mb:g} MB para JSON).",
                    ),
                )
        return await call_next(request)

    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(scenarios.router)
    app.include_router(imports.router)
    app.include_router(runs.router)
    app.include_router(experiments.router)
    return app


app = create_app()
