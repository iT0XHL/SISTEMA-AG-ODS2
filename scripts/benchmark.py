"""Mide tiempo y calidad del AG en instancias sintéticas de distinto tamaño.

Se ejecuta dentro de la imagen del backend (necesita el paquete ``app``):

    docker compose exec api python /srv/scripts/benchmark.py --sizes 6 18 30 50

No toca la base de datos: llama directamente al motor. Sirve para estimar tiempos antes
de una demostración; no forma parte de la evidencia de las cuatro corridas.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.baselines.priority_greedy import compute_baseline
from app.data.demo import generate_demo_scenario
from app.domain.metrics import (
    chromosome_payload,
    routes_payload,
    solution_metrics,
    validate_solution,
)
from app.domain.models import build_problem
from app.domain.validators import Limits, validate_scenario
from app.ga.evolution import run_ga
from app.ga.params import DOCENTE_PRESET, OFFICIAL_SEEDS


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", type=int, nargs="+", default=[6, 18, 30, 50])
    parser.add_argument("--seeds", type=int, nargs="+", default=list(OFFICIAL_SEEDS))
    args = parser.parse_args()
    params = DOCENTE_PRESET
    print("n   seed  J_AG     J_base   ΔJ        km_AG    km_base  gens  cpu_s  factible")
    for n in args.sizes:
        # el inventario y la flota escalan con n para conservar una escasez comparable
        vehicles = max(2, round(n / 6))
        scenario = generate_demo_scenario(
            n_centers=n, inventory_lots=round(7.5 * n), n_vehicles=vehicles
        )
        report = validate_scenario(scenario, Limits(min_centers=1, max_centers=500))
        problem = build_problem(report["normalized"])
        baseline = compute_baseline(problem)
        base = solution_metrics(
            problem, baseline.qty, baseline.decoded, baseline.d_ref, params.weights
        )
        for seed in args.seeds:
            result = run_ga(problem, params, seed, baseline)
            best = result.best
            metrics = solution_metrics(
                problem, best.chromosome.qty, best.decoded, baseline.d_ref, params.weights
            )
            feasible = validate_solution(
                problem,
                chromosome_payload(problem, best.chromosome.perm, best.chromosome.qty),
                routes_payload(problem, best.chromosome.qty, best.decoded),
                best.decoded.total_km,
            )["feasible"]
            print(
                f"{n:<3} {seed:<5} {metrics['J']:.5f}  {base['J']:.5f}  "
                f"{metrics['J'] - base['J']:+.5f}  {metrics['total_km']:7.2f}  "
                f"{base['total_km']:7.2f}  {result.generations_run:<5} "
                f"{result.cpu_seconds:5.2f}  {'sí' if feasible else 'NO'}"
            )


if __name__ == "__main__":
    main()
