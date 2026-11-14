"""Orquestación: línea base, ejecución de corridas y resumen de experimentos.

Regla de publicación: una solución solo se guarda si la validación **desde cero**
confirma todas las restricciones duras. Si falla, la corrida queda ``failed`` y no se
publica ninguna salida inválida.
"""

from __future__ import annotations

import logging
import math
import time
from typing import Any

from app.baselines.priority_greedy import Baseline, compute_baseline
from app.config import get_settings
from app.domain.metrics import (
    assignments_payload,
    chromosome_payload,
    repair_payload,
    routes_payload,
    solution_metrics,
    validate_solution,
)
from app.domain.models import EmptyProblemError, Problem, Weights, build_problem
from app.ga.evolution import STOP_CANCELLED, GenerationRecord, run_ga
from app.ga.params import GAParams
from app.storage import repository as repo
from app.storage.db import session_scope
from app.storage.models import Experiment, Run, Scenario, utcnow

logger = logging.getLogger("nutriruta.runs")

FLUSH_EVERY_GENERATIONS = 5
FLUSH_EVERY_SECONDS = 0.25
BASELINE_METHOD = (
    "Heurística determinista: prioridad descendente (desempate por ID), asignación hasta "
    "capacidad e inventario y orden de cada ruta por vecino más cercano."
)
SOLUTION_LABEL = "Mejor solución encontrada en esta corrida"


def problem_from_scenario(row: Scenario) -> Problem:
    """Compila el problema usando la matriz persistida (idéntica para todas las corridas)."""
    _, matrix = repo.stored_matrix(row)
    return build_problem(repo.scenario_to_dict(row), matrix)


def baseline_payload(problem: Problem, baseline: Baseline, weights: Weights) -> dict[str, Any]:
    """Línea base con las mismas unidades, matriz, ``D_ref`` y función ``J`` que el AG."""
    chromosome = baseline.as_chromosome(problem)
    routes = routes_payload(problem, baseline.qty, baseline.decoded)
    encoded = chromosome_payload(problem, chromosome.perm, baseline.qty)
    return {
        "method": BASELINE_METHOD,
        "d_ref_km": baseline.d_ref,
        "d_ref_is_convention": baseline.d_ref_is_convention,
        "d_ref_note": (
            "La línea base no contiene viajes: se usa D_ref = 1 km solo como convención de "
            "normalización."
            if baseline.d_ref_is_convention
            else None
        ),
        "metrics": solution_metrics(
            problem, baseline.qty, baseline.decoded, baseline.d_ref, weights
        ),
        "routes": routes,
        "assignments": assignments_payload(problem, baseline.qty, baseline.decoded),
        "chromosome": encoded,
        "validation": validate_solution(
            problem, encoded, routes, baseline.decoded.total_km, check_pi_suborder=False
        ),
    }


def compute_scenario_baseline(row: Scenario, weights: Weights | None = None) -> dict[str, Any]:
    problem = problem_from_scenario(row)
    return baseline_payload(problem, compute_baseline(problem), weights or Weights())


def _fail(run_id: str, code: str, message: str) -> None:
    with session_scope() as session:
        run = repo.get_run(session, run_id)
        if run is None:
            return
        run.status = repo.RUN_FAILED
        run.ended_at = utcnow()
        run.error_code = code
        run.error_message = message


def execute_run(run_id: str) -> str:
    """Ejecuta una corrida ya marcada ``running``. Devuelve el estado final."""
    settings = get_settings()
    with session_scope() as session:
        run = repo.get_run(session, run_id)
        if run is None:
            return "missing"
        scenario = repo.get_scenario(session, run.scenario_id)
        seed = run.seed
        params = GAParams(**run.parameters_json)
        try:
            problem = problem_from_scenario(scenario)
        except (EmptyProblemError, ValueError) as exc:
            run.status = repo.RUN_FAILED
            run.ended_at = utcnow()
            run.error_code = getattr(exc, "code", "INVALID_SCENARIO")
            run.error_message = f"El escenario no es ejecutable: {exc}"
            return repo.RUN_FAILED

    buffer: list[GenerationRecord] = []
    state = {"last_flush": time.perf_counter(), "cancel": False, "timeout": False}
    started = time.perf_counter()

    def flush() -> None:
        with session_scope() as session:
            run_row = repo.get_run(session, run_id)
            if buffer:
                repo.add_generations(session, run_id, buffer)
                run_row.progress_generation = buffer[-1].number
                buffer.clear()
            if run_row.cancel_requested:
                state["cancel"] = True
        state["last_flush"] = time.perf_counter()

    def on_generation(record: GenerationRecord) -> None:
        buffer.append(record)
        if (
            len(buffer) >= FLUSH_EVERY_GENERATIONS
            or time.perf_counter() - state["last_flush"] >= FLUSH_EVERY_SECONDS
        ):
            flush()

    def should_stop() -> bool:
        if time.perf_counter() - started > settings.max_run_seconds:
            state["timeout"] = True
        return state["cancel"] or state["timeout"]

    try:
        baseline = compute_baseline(problem)
        result = run_ga(
            problem, params, seed, baseline, on_generation=on_generation, should_stop=should_stop
        )
        flush()
    except EmptyProblemError as exc:
        _fail(run_id, exc.code, exc.message)
        return repo.RUN_FAILED
    except Exception as exc:  # error inesperado: mensaje legible, traza solo en el log
        logger.exception("Fallo inesperado en la corrida %s", run_id)
        _fail(run_id, "RUN_ERROR", f"La corrida falló por un error interno ({type(exc).__name__}).")
        return repo.RUN_FAILED

    if result.stop_reason == STOP_CANCELLED:
        with session_scope() as session:
            run = repo.get_run(session, run_id)
            run.ended_at = utcnow()
            run.stop_reason = STOP_CANCELLED
            if state["timeout"] and not state["cancel"]:
                run.status = repo.RUN_FAILED
                run.error_code = "TIME_LIMIT"
                run.error_message = (
                    f"La corrida superó el tiempo máximo de {settings.max_run_seconds:.0f} s "
                    "y se detuvo. Reduzca generaciones o población."
                )
            else:
                run.status = repo.RUN_CANCELLED
            return run.status

    best = result.best
    qty = best.chromosome.qty
    chromosome = chromosome_payload(problem, best.chromosome.perm, qty)
    routes = routes_payload(problem, qty, best.decoded)
    validation = validate_solution(problem, chromosome, routes, best.decoded.total_km)
    if not validation["feasible"]:
        failed = [c["id"] for c in validation["checks"] if not c["ok"]]
        logger.error("Corrida %s: solución no factible %s", run_id, failed)
        _fail(
            run_id,
            "INFEASIBLE_SOLUTION",
            "La mejor solución no superó la validación de restricciones "
            f"({', '.join(failed)}). No se publica ningún resultado.",
        )
        return repo.RUN_FAILED

    metrics = solution_metrics(problem, qty, best.decoded, baseline.d_ref, params.weights)
    metrics.update(
        {
            "cpu_seconds": result.cpu_seconds,
            "wall_seconds": result.wall_seconds,
            "generations_run": result.generations_run,
            "evaluations": result.evaluations,
            "stop_reason": result.stop_reason,
            "repair_totals_all_evaluations": result.repair_totals,
            "individuals_repaired": result.individuals_repaired,
            "initial_best_fitness": result.history[0].best_fitness,
            "final_diversity": result.history[-1].diversity,
        }
    )
    with session_scope() as session:
        run = repo.get_run(session, run_id)
        repo.save_solution(
            session,
            run_id,
            {
                "chromosome_json": chromosome,
                "decoded_routes_json": routes,
                "metrics_json": metrics,
                "validation_json": validation,
                "assignments_json": assignments_payload(problem, qty, best.decoded),
                "repair_json": repair_payload(problem, best.repair),
                "baseline_json": baseline_payload(problem, baseline, params.weights),
            },
        )
        run.status = repo.RUN_COMPLETED
        run.ended_at = utcnow()
        run.stop_reason = result.stop_reason
        run.progress_generation = result.generations_run
    return repo.RUN_COMPLETED


def process_next_run() -> str | None:
    """Toma una corrida de la cola y la ejecuta. ``None`` si la cola está vacía."""
    with session_scope() as session:
        run = repo.claim_next_run(session)
        if run is None:
            return None
        run_id, status = run.id, run.status
    if status != repo.RUN_RUNNING:  # cancelada antes de empezar
        return run_id
    execute_run(run_id)
    return run_id


# ------------------------------------------------------------------------ serialización
def run_status_payload(run: Run, latest: Any | None = None) -> dict[str, Any]:
    max_generations = int(run.parameters_json.get("max_generations", 0)) or 1
    done = run.status == repo.RUN_COMPLETED
    return {
        "run_id": run.id,
        "scenario_id": run.scenario_id,
        "experiment_id": run.experiment_id,
        "seed": run.seed,
        "status": run.status,
        "progress": {
            "generation": run.progress_generation,
            "max_generations": max_generations,
            "fraction": 1.0 if done else min(1.0, run.progress_generation / max_generations),
        },
        "latest": (
            {
                "generation": latest.number,
                "best_fitness": latest.best_fitness,
                "mean_fitness": latest.mean_fitness,
                "best_J": latest.best_J,
                "diversity": latest.diversity,
            }
            if latest is not None
            else None
        ),
        "parameters": run.parameters_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "code_version": run.code_version,
        "scenario_hash": run.scenario_hash,
        "stop_reason": run.stop_reason,
        "cancel_requested": run.cancel_requested,
        "error": (
            {"code": run.error_code, "message": run.error_message} if run.error_code else None
        ),
    }


def solution_payload(run: Run) -> dict[str, Any]:
    solution = run.solution
    metrics = solution.metrics_json
    base = solution.baseline_json
    base_metrics = base["metrics"]
    return {
        "run_id": run.id,
        "seed": run.seed,
        "scenario_id": run.scenario_id,
        "scenario_hash": run.scenario_hash,
        "code_version": run.code_version,
        "label": SOLUTION_LABEL,
        "parameters": run.parameters_json,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "chromosome": solution.chromosome_json,
        "routes": solution.decoded_routes_json,
        "assignments": solution.assignments_json,
        "metrics": metrics,
        "validation": solution.validation_json,
        "repair": solution.repair_json,
        "baseline": base,
        "comparison": {
            "same_instance": True,
            "d_ref_km": base["d_ref_km"],
            "delta_J": metrics["J"] - base_metrics["J"],
            "delta_km": metrics["total_km"] - base_metrics["total_km"],
            "delta_lots_delivered": metrics["lots_delivered"] - base_metrics["lots_delivered"],
            "delta_weighted_coverage": metrics["weighted_coverage"]
            - base_metrics["weighted_coverage"],
            "ga_better_than_baseline": metrics["J"] < base_metrics["J"],
        },
    }


def _mean_std(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mean": None, "std": None}
    mean = sum(values) / len(values)
    if len(values) < 2:
        return {"mean": mean, "std": None}
    variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return {"mean": mean, "std": math.sqrt(variance)}


EXPERIMENT_ROW_METRICS = (
    "J",
    "fitness",
    "U",
    "R",
    "H",
    "lots_delivered",
    "lots_demanded",
    "weighted_coverage",
    "total_km",
    "vehicles_used",
    "cpu_seconds",
    "generations_run",
    "centers_served",
    "high_priority_unserved",
)


def experiment_payload(experiment: Experiment, scenario: Scenario) -> dict[str, Any]:
    """Tabla de las cuatro corridas + resumen. La media no reemplaza las filas individuales."""
    rows = []
    completed_metrics: list[dict[str, Any]] = []
    for order, run in enumerate(sorted(experiment.runs, key=lambda r: r.queue_order), start=1):
        row: dict[str, Any] = {
            "corrida": order,
            "seed": run.seed,
            "run_id": run.id,
            "status": run.status,
            "progress_generation": run.progress_generation,
            "stop_reason": run.stop_reason,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            "error": (
                {"code": run.error_code, "message": run.error_message} if run.error_code else None
            ),
            "metrics": None,
            "feasible": None,
        }
        if run.status == repo.RUN_COMPLETED and run.solution is not None:
            metrics = run.solution.metrics_json
            row["metrics"] = {key: metrics.get(key) for key in EXPERIMENT_ROW_METRICS}
            row["metrics"]["distance_mode"] = metrics["distance_mode"]
            row["metrics"]["distance_mode_label"] = metrics["distance_mode_label"]
            row["feasible"] = run.solution.validation_json["feasible"]
            completed_metrics.append(metrics)
        rows.append(row)

    statuses = {row["status"] for row in rows}
    if statuses == {repo.RUN_COMPLETED}:
        status = "completed"
    elif statuses & {repo.RUN_QUEUED, repo.RUN_RUNNING}:
        status = "running"
    else:
        status = "failed"

    params = GAParams(**experiment.parameters_json)
    baseline = compute_scenario_baseline(scenario, params.weights)
    summary = None
    if status == "completed":
        summary = {
            key: _mean_std([float(m[key]) for m in completed_metrics])
            for key in (
                "J",
                "fitness",
                "U",
                "R",
                "H",
                "weighted_coverage",
                "total_km",
                "lots_delivered",
                "cpu_seconds",
                "generations_run",
            )
        }
        summary["std_note"] = "Desviación estándar muestral (n − 1) sobre las cuatro corridas."
        summary["runs_better_than_baseline"] = sum(
            1 for m in completed_metrics if m["J"] < baseline["metrics"]["J"]
        )
        summary["all_feasible"] = all(row["feasible"] for row in rows)
    return {
        "experiment_id": experiment.id,
        "scenario_id": experiment.scenario_id,
        "scenario_label": scenario.name,
        "scenario_hash": experiment.scenario_hash,
        "data_origin": scenario.origin,
        "seeds": experiment.seeds,
        "parameters": experiment.parameters_json,
        "code_version": experiment.code_version,
        "created_at": experiment.created_at.isoformat(),
        "status": status,
        "runs": rows,
        "baseline": {
            "method": baseline["method"],
            "d_ref_km": baseline["d_ref_km"],
            "d_ref_is_convention": baseline["d_ref_is_convention"],
            "metrics": baseline["metrics"],
            "feasible": baseline["validation"]["feasible"],
        },
        "summary": summary,
    }
