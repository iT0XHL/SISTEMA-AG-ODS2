"""Estado técnico y metadatos de la aplicación."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import __version__
from app.api.dependencies import get_session
from app.config import Settings, get_settings
from app.data.imports import ALLOWED_FIELDS
from app.domain.models import DISTANCE_MODE_LABELS
from app.ga.params import STANDARD_PRESET, OFFICIAL_SEEDS
from app.services.exports import DECLARATION
from app.storage import repository as repo
from app.storage.models import Run

router = APIRouter(tags=["estado"])


@router.get("/health")
def health(
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    try:
        session.execute(text("SELECT 1"))
        queued = session.scalar(
            select(func.count()).select_from(Run).where(Run.status == repo.RUN_QUEUED)
        )
        database = "ok"
    except Exception:
        queued, database = None, "error"
    body = {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "queued_runs": queued,
        "version": __version__,
        "code_version": settings.code_version,
        "environment": settings.app_env,
        "time_utc": datetime.now(UTC).isoformat(),
    }
    return JSONResponse(body, status_code=200 if database == "ok" else 503)


@router.get("/api/v1/meta")
def meta(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Límites, preset estándar y textos que la interfaz muestra tal cual."""
    return {
        "app": "NutriRuta AG",
        "version": __version__,
        "code_version": settings.code_version,
        "declaration": DECLARATION,
        "limits": {
            "min_centers": settings.min_centers,
            "max_centers": settings.max_centers,
            "max_vehicles": settings.max_vehicles,
            "max_generations": settings.max_generations,
            "max_population": settings.max_population,
            "max_upload_mb": settings.max_upload_mb,
            "max_run_seconds": settings.max_run_seconds,
        },
        "standard_preset": STANDARD_PRESET.to_dict(),
        "official_seeds": list(OFFICIAL_SEEDS),
        "distance_modes": DISTANCE_MODE_LABELS,
        "import_allowed_fields": ALLOWED_FIELDS,
        "routing_engine_installed": False,
    }
