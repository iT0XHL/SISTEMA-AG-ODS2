"""Aplicación FastAPI de NutriRuta AG."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__, auth
from app.api.dependencies import require_user
from app.api.errors import error_body, register_error_handlers
from app.api.routes import auth as auth_routes
from app.api.routes import experiments, health, imports, runs, scenarios
from app.config import get_settings
from app.ratelimit import RateLimiter, classify, client_key
from app.storage.db import init_db, session_scope

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    problems = get_settings().production_problems() if get_settings().is_production else []
    if problems:
        raise RuntimeError("Configuración no apta para producción: " + " ".join(problems))
    init_db()
    with session_scope() as session:
        created = auth.ensure_default_user(session, get_settings())
    if created is not None:
        logging.getLogger("nutriruta.api").info(
            "Cuenta inicial «%s» creada; cambie la contraseña antes de compartir el sistema.",
            created.username,
        )
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
        allow_headers=["Content-Type", "Authorization"],
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

    app.state.rate_limiter = RateLimiter()

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        """Responde 429 al cliente que supera su cupo por minuto."""
        if settings.rate_limit_enabled:
            rule = classify(request.method, request.url.path, settings)
            if rule is not None:
                bucket, limit = rule
                wait = request.app.state.rate_limiter.hit(
                    bucket, client_key(request, settings.trusted_proxy_hops), limit
                )
                if wait:
                    return JSONResponse(
                        status_code=429,
                        headers={"Retry-After": str(wait)},
                        content=error_body(
                            "RATE_LIMITED",
                            f"Demasiadas solicitudes. Espere {wait} s para volver a intentarlo.",
                            None,
                            {"retry_after": wait, "bucket": bucket},
                        ),
                    )
        return await call_next(request)

    register_error_handlers(app)
    protected = [Depends(require_user)]
    app.include_router(health.router)
    app.include_router(auth_routes.router)
    app.include_router(scenarios.router, dependencies=protected)
    app.include_router(imports.router, dependencies=protected)
    app.include_router(runs.router, dependencies=protected)
    app.include_router(experiments.router, dependencies=protected)
    return app


app = create_app()
