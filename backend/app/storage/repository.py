"""Acceso a datos: escenarios, corridas, historial, soluciones y experimentos."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.models import build_distance_matrix
from app.domain.validators import SCENARIO_SCHEMA_VERSION
from app.storage.models import (
    Center,
    Distance,
    Experiment,
    Generation,
    Run,
    Scenario,
    Solution,
    Vehicle,
    utcnow,
)

RUN_QUEUED = "queued"
RUN_RUNNING = "running"
RUN_COMPLETED = "completed"
RUN_FAILED = "failed"
RUN_CANCELLED = "cancelled"
RUN_FINAL = (RUN_COMPLETED, RUN_FAILED, RUN_CANCELLED)


# --------------------------------------------------------------------------- escenarios
def save_scenario(session: Session, scenario: dict[str, Any], digest: str) -> Scenario:
    """Persiste un escenario **ya validado y normalizado**, incluida su matriz completa."""
    node_ids, matrix, source = build_distance_matrix(scenario)
    row = Scenario(
        id=scenario["scenario_id"] or str(uuid.uuid4()),
        name=scenario["label"],
        origin=scenario["data_origin"],
        version=SCENARIO_SCHEMA_VERSION,
        hash=digest,
        distance_mode=scenario["distance_mode"],
        distance_source=source,
        depot=scenario["depot"],
        inventory_lots=int(scenario["inventory_lots"]),
        data_license=scenario.get("data_license"),
        notes=scenario.get("notes"),
        priority_criterion=scenario.get("priority_criterion"),
        demand_rule=scenario.get("demand_rule"),
        fixture_seed=scenario.get("fixture_seed"),
    )
    row.centers = [
        Center(
            center_id=c["id"],
            name=c["name"],
            district=c.get("district"),
            address=c.get("address"),
            lat=c.get("lat"),
            lon=c.get("lon"),
            demand_lots=int(c["demand_lots"]),
            priority_weight=int(c["priority_weight"]),
            data_origin=c["source"],
            demand_origin=c["demand_origin"],
            users_aggregate=c.get("users_aggregate"),
        )
        for c in scenario["centers"]
    ]
    row.vehicles = [
        Vehicle(vehicle_id=v["id"], capacity_lots=int(v["capacity_lots"]))
        for v in scenario["vehicles"]
    ]
    row.distances = [
        Distance(from_id=a, to_id=b, km=matrix[i][j], source=source)
        for i, a in enumerate(node_ids)
        for j, b in enumerate(node_ids)
        if i != j
    ]
    session.add(row)
    session.flush()
    return row


def get_scenario(session: Session, scenario_id: str) -> Scenario | None:
    return session.get(Scenario, scenario_id)


def list_scenarios(session: Session) -> list[Scenario]:
    return list(session.scalars(select(Scenario).order_by(Scenario.created_at.desc())))


def scenario_to_dict(row: Scenario, include_distances: bool = False) -> dict[str, Any]:
    """Escenario normalizado. Por construcción no contiene datos personales."""
    data: dict[str, Any] = {
        "scenario_id": row.id,
        "label": row.name,
        "data_origin": row.origin,
        "distance_mode": row.distance_mode,
        "distance_source": row.distance_source,
        "depot": row.depot,
        "inventory_lots": row.inventory_lots,
        "vehicles": [{"id": v.vehicle_id, "capacity_lots": v.capacity_lots} for v in row.vehicles],
        "centers": [
            {
                "id": c.center_id,
                "name": c.name,
                "district": c.district,
                "address": c.address,
                "lat": c.lat,
                "lon": c.lon,
                "demand_lots": c.demand_lots,
                "priority_weight": c.priority_weight,
                "source": c.data_origin,
                "demand_origin": c.demand_origin,
                "users_aggregate": c.users_aggregate,
            }
            for c in row.centers
        ],
        "distances": [],
        "data_license": row.data_license,
        "notes": row.notes,
        "priority_criterion": row.priority_criterion,
        "demand_rule": row.demand_rule,
        "fixture_seed": row.fixture_seed,
    }
    if include_distances:
        data["distances"] = [
            {"from_id": d.from_id, "to_id": d.to_id, "km": d.km}
            for d in sorted(row.distances, key=lambda d: (d.from_id, d.to_id))
        ]
    return data


def stored_matrix(row: Scenario) -> tuple[list[str], list[list[float]]]:
    """Matriz persistida: índice 0 = depósito, luego centros en orden de ID."""
    node_ids = [row.depot["id"]] + [c.center_id for c in row.centers]
    index = {node_id: k for k, node_id in enumerate(node_ids)}
    matrix = [[0.0] * len(node_ids) for _ in node_ids]
    for d in row.distances:
        matrix[index[d.from_id]][index[d.to_id]] = d.km
    return node_ids, matrix


def count_runs(session: Session, scenario_id: str) -> int:
    return (
        session.scalar(select(func.count()).select_from(Run).where(Run.scenario_id == scenario_id))
        or 0
    )


# ------------------------------------------------------------------------------ corridas
def create_run(
    session: Session,
    scenario: Scenario,
    seed: int,
    parameters: dict[str, Any],
    code_version: str,
    experiment_id: str | None = None,
    queue_order: int = 0,
) -> Run:
    run = Run(
        id=str(uuid.uuid4()),
        scenario_id=scenario.id,
        experiment_id=experiment_id,
        seed=seed,
        parameters_json=parameters,
        status=RUN_QUEUED,
        created_at=utcnow(),
        code_version=code_version,
        scenario_hash=scenario.hash,
        queue_order=queue_order,
    )
    session.add(run)
    session.flush()
    return run


def get_run(session: Session, run_id: str) -> Run | None:
    return session.get(Run, run_id)


def list_runs(session: Session, scenario_id: str | None = None, limit: int = 50) -> list[Run]:
    query = select(Run).order_by(Run.created_at.desc(), Run.queue_order.desc()).limit(limit)
    if scenario_id:
        query = query.where(Run.scenario_id == scenario_id)
    return list(session.scalars(query))


def claim_next_run(session: Session) -> Run | None:
    """Toma la siguiente corrida en cola (FIFO) y la marca ``running``."""
    query = (
        select(Run)
        .where(Run.status == RUN_QUEUED)
        .order_by(Run.created_at, Run.queue_order)
        .limit(1)
    )
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    run = session.scalars(query).first()
    if run is None:
        return None
    if run.cancel_requested:
        run.status = RUN_CANCELLED
        run.ended_at = utcnow()
        run.stop_reason = "cancelled"
    else:
        run.status = RUN_RUNNING
        run.started_at = utcnow()
    session.flush()
    return run


def add_generations(session: Session, run_id: str, records: list[Any]) -> None:
    session.add_all(
        Generation(
            run_id=run_id,
            number=r.number,
            best_fitness=r.best_fitness,
            mean_fitness=r.mean_fitness,
            best_J=r.best_j,
            diversity=r.diversity,
        )
        for r in records
    )


def get_history(session: Session, run_id: str, since: int = 0) -> list[Generation]:
    return list(
        session.scalars(
            select(Generation)
            .where(Generation.run_id == run_id, Generation.number >= since)
            .order_by(Generation.number)
        )
    )


def latest_generation(session: Session, run_id: str) -> Generation | None:
    return session.scalars(
        select(Generation)
        .where(Generation.run_id == run_id)
        .order_by(Generation.number.desc())
        .limit(1)
    ).first()


def save_solution(session: Session, run_id: str, payload: dict[str, Any]) -> Solution:
    solution = Solution(run_id=run_id, **payload)
    session.add(solution)
    return solution


def get_solution(session: Session, run_id: str) -> Solution | None:
    return session.get(Solution, run_id)


def recover_interrupted_runs(session: Session) -> int:
    """Al arrancar el worker: las corridas que quedaron ``running`` se marcan fallidas."""
    stale = list(session.scalars(select(Run).where(Run.status == RUN_RUNNING)))
    for run in stale:
        run.status = RUN_FAILED
        run.ended_at = utcnow()
        run.error_code = "WORKER_INTERRUPTED"
        run.error_message = (
            "La corrida se interrumpió porque el worker se reinició. Vuelva a ejecutarla."
        )
    return len(stale)


# -------------------------------------------------------------------------- experimentos
def create_experiment(
    session: Session,
    scenario: Scenario,
    seeds: list[int],
    parameters: dict[str, Any],
    code_version: str,
) -> Experiment:
    experiment = Experiment(
        id=str(uuid.uuid4()),
        scenario_id=scenario.id,
        seeds=seeds,
        parameters_json=parameters,
        scenario_hash=scenario.hash,
        code_version=code_version,
    )
    session.add(experiment)
    session.flush()
    for order, seed in enumerate(seeds):
        create_run(
            session,
            scenario,
            seed,
            parameters,
            code_version,
            experiment_id=experiment.id,
            queue_order=order,
        )
    session.flush()
    return experiment


def get_experiment(session: Session, experiment_id: str) -> Experiment | None:
    return session.get(Experiment, experiment_id)


def list_experiments(session: Session, scenario_id: str | None = None) -> list[Experiment]:
    query = select(Experiment).order_by(Experiment.created_at.desc())
    if scenario_id:
        query = query.where(Experiment.scenario_id == scenario_id)
    return list(session.scalars(query))
