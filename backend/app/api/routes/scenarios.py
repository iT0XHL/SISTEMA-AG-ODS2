"""Escenarios: demo, validación, creación y lectura (plan §6.2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_session, limits_from, require_scenario
from app.api.errors import ApiError
from app.api.schemas import DemoRequest, ScenarioIn
from app.config import Settings, get_settings
from app.data.demo import generate_demo_scenario
from app.domain.validators import validate_scenario
from app.storage import repository as repo
from app.storage.models import Scenario

router = APIRouter(prefix="/api/v1/scenarios", tags=["escenarios"])

PROVENANCE_NOTES = {
    "synthetic": "Datos sintéticos de demostración; no representan centros reales.",
    "official": "Identificación tomada de un padrón oficial cargado por el usuario.",
    "declared": "Datos declarados por el usuario; requieren verificación institucional.",
    "mixed": "Combinación de orígenes; revise el origen de cada centro.",
}


def provenance(row: Scenario) -> dict[str, Any]:
    by_source: dict[str, int] = {}
    by_demand: dict[str, int] = {}
    for center in row.centers:
        by_source[center.data_origin] = by_source.get(center.data_origin, 0) + 1
        by_demand[center.demand_origin] = by_demand.get(center.demand_origin, 0) + 1
    return {
        "data_origin": row.origin,
        "badge": "Simulación" if row.origin == "synthetic" else "Datos declarados / por verificar",
        "note": PROVENANCE_NOTES.get(row.origin),
        "centers_by_source": by_source,
        "centers_by_demand_origin": by_demand,
        "distance_mode": row.distance_mode,
        "distance_source": row.distance_source,
        "data_license": row.data_license,
        "fixture_seed": row.fixture_seed,
        "priority_criterion": row.priority_criterion,
        "demand_rule": row.demand_rule,
    }


def summary(row: Scenario, runs: int = 0) -> dict[str, Any]:
    return {
        "scenario_id": row.id,
        "label": row.name,
        "data_origin": row.origin,
        "distance_mode": row.distance_mode,
        "hash": row.hash,
        "version": row.version,
        "created_at": row.created_at.isoformat(),
        "n_centers": len(row.centers),
        "n_vehicles": len(row.vehicles),
        "inventory_lots": row.inventory_lots,
        "total_demand": sum(c.demand_lots for c in row.centers),
        "runs": runs,
    }


@router.post("/demo")
def demo_scenario(body: DemoRequest | None = None) -> dict[str, Any]:
    """Genera el escenario sintético determinista (no lo guarda)."""
    body = body or DemoRequest()
    return generate_demo_scenario(body.n_centers, body.fixture_seed)


@router.post("/validate")
def validate(body: ScenarioIn, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Valida esquema y reglas de dominio **sin guardar**."""
    report = validate_scenario(body.to_payload(), limits_from(settings))
    report.pop("normalized", None)
    return report


@router.post("", status_code=201)
def create_scenario(
    body: ScenarioIn,
    response: Response,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Guarda un escenario depurado. Rechaza cualquier escenario incompleto o inválido."""
    report = validate_scenario(body.to_payload(), limits_from(settings))
    if not report["valid"]:
        first = report["errors"][0]
        raise ApiError(
            422,
            "SCENARIO_INVALID",
            f"El escenario tiene {len(report['errors'])} error(es) y no puede guardarse. "
            f"Primero: {first['message']}",
            first.get("field"),
            {"errors": report["errors"], "warnings": report["warnings"]},
        )
    scenario = report["normalized"]
    created = True
    existing = (
        repo.get_scenario(session, scenario["scenario_id"]) if scenario["scenario_id"] else None
    )
    if existing is not None:
        if existing.hash != report["hash"]:
            raise ApiError(
                409,
                "SCENARIO_ID_CONFLICT",
                f"Ya existe un escenario «{existing.id}» con contenido distinto. Use otro "
                "identificador: los escenarios guardados no se modifican para que las corridas "
                "sigan siendo reproducibles.",
                "scenario_id",
            )
        row, created = existing, False
        response.status_code = 200
    else:
        row = repo.save_scenario(session, scenario, report["hash"])
    return {
        "id": row.id,
        "hash": row.hash,
        "created": created,
        "provenance": provenance(row),
        "warnings": report["warnings"],
        "flags": report["flags"],
    }


@router.get("")
def list_scenarios(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [summary(row, repo.count_runs(session, row.id)) for row in repo.list_scenarios(session)]


@router.get("/{scenario_id}")
def read_scenario(
    scenario_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Escenario completo. No contiene datos personales: el esquema no los admite."""
    row = require_scenario(session, scenario_id)
    data = repo.scenario_to_dict(row, include_distances=row.distance_mode == "road_matrix")
    report = validate_scenario(data, limits_from(settings))
    return {
        **summary(row, repo.count_runs(session, row.id)),
        "scenario": {**data, "distances": []},
        "provenance": provenance(row),
        "warnings": report["warnings"],
        "flags": report["flags"],
        "validation_summary": report["summary"],
    }


@router.get("/{scenario_id}/matrix")
def read_matrix(scenario_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    row = require_scenario(session, scenario_id)
    node_ids, matrix = repo.stored_matrix(row)
    return {
        "scenario_id": row.id,
        "distance_mode": row.distance_mode,
        "distance_source": row.distance_source,
        "unit": "km",
        "ids": node_ids,
        "matrix_km": matrix,
    }


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: str, session: Session = Depends(get_session)) -> Response:
    """Elimina un escenario junto con sus corridas y experimentos."""
    row = require_scenario(session, scenario_id)
    for run in repo.list_runs(session, row.id, limit=100000):
        session.delete(run)
    session.flush()
    for experiment in repo.list_experiments(session, row.id):
        session.delete(experiment)
    session.flush()
    session.delete(row)
    return Response(status_code=204)
