"""Experimento de cuatro corridas con semillas fijas 11/22/33/44 (plan §6.2, §9.2).

El experimento usa siempre el preset «Estándar»: mismos parámetros, mismo escenario,
misma matriz y misma ``D_ref`` para las cuatro semillas.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_session, require_scenario
from app.api.errors import ApiError
from app.api.schemas import FourRunsRequest
from app.config import Settings, get_settings
from app.ga.params import OFFICIAL_SEEDS, STANDARD_PRESET
from app.services import exports
from app.services.run_service import experiment_payload
from app.storage import repository as repo
from app.storage.models import Experiment

router = APIRouter(prefix="/api/v1/experiments", tags=["experimentos"])


def _require_experiment(session: Session, experiment_id: str) -> Experiment:
    experiment = repo.get_experiment(session, experiment_id)
    if experiment is None:
        raise ApiError(404, "EXPERIMENT_NOT_FOUND", f"No existe el experimento «{experiment_id}».")
    return experiment


@router.post("/four-runs", status_code=202)
def four_runs(
    body: FourRunsRequest,
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Encola exactamente cuatro corridas (11, 22, 33, 44) sin mezclar semillas ni parámetros."""
    scenario = require_scenario(session, body.scenario_id)
    experiment = repo.create_experiment(
        session, scenario, list(OFFICIAL_SEEDS), STANDARD_PRESET.to_dict(), settings.code_version
    )
    session.refresh(experiment)
    return {
        "experiment_id": experiment.id,
        "scenario_id": scenario.id,
        "scenario_hash": scenario.hash,
        "seeds": experiment.seeds,
        "parameters": experiment.parameters_json,
        "runs": [
            {"seed": run.seed, "run_id": run.id, "status": run.status}
            for run in sorted(experiment.runs, key=lambda r: r.queue_order)
        ],
    }


@router.get("")
def list_experiments(
    scenario_id: str | None = Query(default=None),
    session: Session = Depends(get_session, scope="function"),
) -> list[dict[str, Any]]:
    return [
        {
            "experiment_id": e.id,
            "scenario_id": e.scenario_id,
            "created_at": e.created_at.isoformat(),
            "seeds": e.seeds,
            "statuses": [run.status for run in sorted(e.runs, key=lambda r: r.queue_order)],
        }
        for e in repo.list_experiments(session, scenario_id)
    ]


@router.get("/{experiment_id}")
def read_experiment(
    experiment_id: str, session: Session = Depends(get_session, scope="function")
) -> dict[str, Any]:
    experiment = _require_experiment(session, experiment_id)
    scenario = repo.get_scenario(session, experiment.scenario_id)
    return experiment_payload(experiment, scenario)


@router.get("/{experiment_id}/export")
def export_experiment(
    experiment_id: str,
    format: str = Query(default="csv", pattern="^(json|csv)$"),
    session: Session = Depends(get_session, scope="function"),
) -> Response:
    """Tabla de las cuatro corridas en CSV UTF-8 (o JSON con historial y metadatos)."""
    experiment = _require_experiment(session, experiment_id)
    scenario = repo.get_scenario(session, experiment.scenario_id)
    payload = experiment_payload(experiment, scenario)
    if payload["status"] != "completed":
        raise ApiError(
            409,
            "EXPERIMENT_NOT_COMPLETED",
            "El experimento aún no tiene sus cuatro corridas completadas; no se exportan "
            "tablas parciales.",
            details={"status": payload["status"]},
        )
    filename = f"nutriruta_cuatro_corridas_{experiment.id[:8]}"
    if format == "csv":
        return Response(
            content=exports.experiment_csv(payload),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )
    histories = {
        str(run.seed): [
            {
                "number": g.number,
                "best_fitness": g.best_fitness,
                "mean_fitness": g.mean_fitness,
                "best_J": g.best_J,
                "diversity": g.diversity,
            }
            for g in repo.get_history(session, run.id)
        ]
        for run in experiment.runs
    }
    solutions = {
        str(run.seed): {
            "chromosome": run.solution.chromosome_json,
            "routes": run.solution.decoded_routes_json,
            "assignments": run.solution.assignments_json,
            "validation": run.solution.validation_json,
            "repair": run.solution.repair_json,
        }
        for run in experiment.runs
    }
    body = exports.export_envelope(
        "four_runs",
        {
            "experiment": payload,
            "scenario": repo.scenario_to_dict(scenario),
            "histories_by_seed": histories,
            "solutions_by_seed": solutions,
        },
    )
    return Response(
        content=json.dumps(body, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )
