"""Dependencias compartidas de las rutas."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request, UploadFile
from sqlalchemy.orm import Session

from app import auth
from app.api.errors import ApiError
from app.config import Settings, get_settings
from app.domain.validators import Limits
from app.storage import repository as repo
from app.storage.db import get_session_factory, session_scope
from app.storage.models import AppUser, Run, Scenario


def get_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def session_token(request: Request) -> str | None:
    """Token de sesión: cabecera ``Authorization: Bearer`` (frontend en otro dominio) o cookie."""
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return request.cookies.get(auth.SESSION_COOKIE)


def require_user(request: Request) -> AppUser:
    """Exige una sesión válida: el token debe corresponder a una sesión vigente."""
    with session_scope() as session:
        user = auth.user_for_token(session, session_token(request))
    if user is None:
        raise ApiError(401, "NOT_AUTHENTICATED", "Inicie sesión para continuar.")
    return user


def limits_from(settings: Settings) -> Limits:
    return Limits(
        min_centers=settings.min_centers,
        max_centers=settings.max_centers,
        max_vehicles=settings.max_vehicles,
    )


def require_scenario(session: Session, scenario_id: str) -> Scenario:
    scenario = repo.get_scenario(session, scenario_id)
    if scenario is None:
        raise ApiError(
            404, "SCENARIO_NOT_FOUND", f"No existe el escenario «{scenario_id}».", "scenario_id"
        )
    return scenario


def require_run(session: Session, run_id: str) -> Run:
    run = repo.get_run(session, run_id)
    if run is None:
        raise ApiError(404, "RUN_NOT_FOUND", f"No existe la corrida «{run_id}».", "run_id")
    return run


async def read_upload(file: UploadFile, settings: Settings | None = None) -> bytes:
    """Lee un archivo subido en memoria, con límite de tamaño. No se guarda en disco."""
    settings = settings or get_settings()
    limit = settings.max_upload_bytes
    content = await file.read(limit + 1)
    await file.close()
    if len(content) > limit:
        raise ApiError(
            413,
            "FILE_TOO_LARGE",
            f"El archivo supera el máximo de {settings.max_upload_mb:g} MB.",
            "file",
        )
    if not content:
        raise ApiError(422, "EMPTY_FILE", "El archivo está vacío.", "file")
    return content
