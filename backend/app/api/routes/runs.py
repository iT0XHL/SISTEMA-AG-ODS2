"""Línea base y corridas del AG (plan §6.2)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_session, require_run, require_scenario
from app.api.errors import ApiError
from app.api.schemas import BaselineRequest, GAParamsIn, RunRequest
from app.config import Settings, get_settings
from app.domain.models import Weights
from app.ga.params import GAParams
from app.services import exports
from app.services.run_service import (
    compute_scenario_baseline,
    run_status_payload,
    solution_payload,
)
from app.storage import repository as repo

router = APIRouter(prefix="/api/v1", tags=["corridas"])


def checked_params(body: GAParamsIn | None, settings: Settings) -> GAParams:
    params = (body or GAParamsIn()).to_params()
    try:
        params.validate()
    except ValueError as exc:
        raise ApiError(
            422, "INVALID_PARAMETERS", f"Parámetros inválidos: {exc}.", "parameters"
        ) from exc
    if params.max_generations > settings.max_generations:
        raise ApiError(
            422,
            "TOO_MANY_GENERATIONS",
            f"El máximo permitido es {settings.max_generations} generaciones.",
            "parameters.max_generations",
        )
    if params.population_size > settings.max_population:
        raise ApiError(
            422,
            "POPULATION_TOO_LARGE",
            f"El máximo permitido es una población de {settings.max_population}.",
            "parameters.population_size",
        )
    return params


@router.post("/baselines")
def baseline(body: BaselineRequest, session: Session = Depends(get_session)) -> dict[str, Any]:
    """Línea base determinista del escenario (misma matriz, unidades y ``D_ref`` que el AG)."""
    scenario = require_scenario(session, body.scenario_id)
    weights = Weights(**body.weights.model_dump()) if body.weights else Weights()
    if abs(weights.w_u + weights.w_r + weights.w_h - 1.0) > 1e-9:
        raise ApiError(422, "INVALID_WEIGHTS", "Los pesos deben sumar 1.", "weights")
    return {
        "scenario_id": scenario.id,
        "scenario_hash": scenario.hash,
        **compute_scenario_baseline(scenario, weights),
    }


@router.post("/runs", status_code=202)
def start_run(
    body: RunRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Encola una corrida del AG. El worker la ejecuta de forma asíncrona."""
    scenario = require_scenario(session, body.scenario_id)
    params = checked_params(body.parameters, settings)
    run = repo.create_run(session, scenario, body.seed, params.to_dict(), settings.code_version)
    return {"run_id": run.id, "status": run.status, "seed": run.seed, "scenario_id": scenario.id}


@router.get("/runs")
def list_runs(
    scenario_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    return [run_status_payload(run) for run in repo.list_runs(session, scenario_id, limit)]


@router.get("/runs/{run_id}")
def read_run(run_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    run = require_run(session, run_id)
    return run_status_payload(run, repo.latest_generation(session, run_id))


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    """Solicita cancelar. Una corrida en cola se cancela de inmediato; una en ejecución,
    al cerrar la generación en curso."""
    run = require_run(session, run_id)
    if run.status in repo.RUN_FINAL:
        raise ApiError(
            409, "RUN_ALREADY_FINISHED", f"La corrida ya terminó con estado «{run.status}»."
        )
    run.cancel_requested = True
    session.flush()
    return run_status_payload(run)


def _completed_run(session: Session, run_id: str):
    run = require_run(session, run_id)
    if run.status != repo.RUN_COMPLETED or run.solution is None:
        raise ApiError(
            409,
            "RUN_NOT_COMPLETED",
            f"La corrida está en estado «{run.status}»: aún no hay una solución validada.",
            details={"status": run.status, "error": run.error_message},
        )
    return run


@router.get("/runs/{run_id}/solution")
def read_solution(run_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    """Mejor solución **validada** de la corrida: rutas, cantidades y métricas."""
    return solution_payload(_completed_run(session, run_id))


@router.get("/runs/{run_id}/history")
def read_history(
    run_id: str,
    since: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Fitness por generación (vector para el gráfico). ``since`` permite lectura incremental."""
    run = require_run(session, run_id)
    rows = repo.get_history(session, run_id, since)
    return {
        "run_id": run.id,
        "status": run.status,
        "generations": [
            {
                "number": g.number,
                "best_fitness": g.best_fitness,
                "mean_fitness": g.mean_fitness,
                "best_J": g.best_J,
                "diversity": g.diversity,
            }
            for g in rows
        ],
    }


@router.get("/runs/{run_id}/export")
def export_run(
    run_id: str,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    session: Session = Depends(get_session),
) -> Response:
    """Evidencia de una corrida: JSON completo o CSV de asignaciones."""
    run = _completed_run(session, run_id)
    solution = solution_payload(run)
    scenario = repo.get_scenario(session, run.scenario_id)
    filename = f"nutriruta_corrida_seed{run.seed}_{run.id[:8]}"
    if format == "csv":
        names = {c.center_id: c.name for c in scenario.centers}
        return Response(
            content=exports.assignments_csv(solution, names),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )
    history = [
        {
            "number": g.number,
            "best_fitness": g.best_fitness,
            "mean_fitness": g.mean_fitness,
            "best_J": g.best_J,
            "diversity": g.diversity,
        }
        for g in repo.get_history(session, run_id)
    ]
    body = exports.export_envelope(
        "run",
        {
            "scenario": repo.scenario_to_dict(scenario),
            "solution": solution,
            "history": history,
        },
    )
    return Response(
        content=json.dumps(body, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )
