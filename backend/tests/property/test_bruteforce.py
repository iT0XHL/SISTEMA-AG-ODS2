"""Comparación exacta en instancias pequeñas (plan §9.2).

Se enumeran **todas** las asignaciones ``q`` y **todos** los órdenes ``π`` de una
instancia de 5 centros, pasándolos por el mismo decodificador y la misma función
``J`` que usa el AG. El mínimo enumerado es el óptimo del espacio de búsqueda.

Como se minimiza, lo que se exige es ``J_AG ≥ J_óptimo`` (nunca lo contrario) y que
toda solución sea factible. **No** se exige que el AG alcance el óptimo en todos los
ensayos: es una heurística.
"""

from __future__ import annotations

from itertools import permutations, product

import pytest

from app.baselines.priority_greedy import compute_baseline
from app.domain.metrics import chromosome_payload, routes_payload, validate_solution
from app.ga.chromosome import Chromosome
from app.ga.evolution import run_ga
from app.ga.fitness import evaluate
from app.ga.params import OFFICIAL_SEEDS, STANDARD_PRESET
from tests.conftest import make_problem

EPS = 1e-12


def small_instance():
    # 5 centros, 2 vehículos de 4 lotes, inventario 7 (escasez: demanda total 13)
    dist = [
        [0.0, 2.0, 4.5, 3.0, 5.0, 1.5],
        [2.0, 0.0, 2.5, 4.0, 6.0, 3.0],
        [4.5, 2.5, 0.0, 3.5, 2.0, 5.5],
        [3.0, 4.0, 3.5, 0.0, 2.5, 2.0],
        [5.0, 6.0, 2.0, 2.5, 0.0, 4.0],
        [1.5, 3.0, 5.5, 2.0, 4.0, 0.0],
    ]
    return make_problem(
        demand=[3, 2, 3, 2, 3], priority=[3, 1, 2, 1, 3], capacities=[4, 4], inventory=7, dist=dist
    )


@pytest.fixture(scope="module")
def exhaustive():
    problem = small_instance()
    baseline = compute_baseline(problem)
    weights = STANDARD_PRESET.weights
    best_j = float("inf")
    count = 0
    for perm in permutations(range(problem.n)):
        for qty in product(*(range(u + 1) for u in problem.upper)):
            individual = evaluate(
                problem, Chromosome(list(perm), list(qty)), baseline.d_ref, weights
            )
            count += 1
            if individual.j < best_j:
                best_j = individual.j
    return problem, baseline, best_j, count


@pytest.mark.slow
def test_enumeration_covers_the_whole_search_space(exhaustive) -> None:
    _, _, best_j, count = exhaustive
    assert count == 120 * (4 * 3 * 4 * 3 * 4)  # 5! órdenes × 576 vectores q
    assert 0 < best_j < 1


@pytest.mark.slow
def test_ga_never_beats_the_exhaustive_optimum_and_is_feasible(exhaustive) -> None:
    problem, baseline, best_j, _ = exhaustive
    weights = STANDARD_PRESET.weights
    gaps = {}
    for seed in OFFICIAL_SEEDS:
        result = run_ga(problem, STANDARD_PRESET, seed, baseline)
        best = result.best
        assert best.j >= best_j - EPS, "el AG no puede ser mejor que el óptimo enumerado"
        report = validate_solution(
            problem,
            chromosome_payload(problem, best.chromosome.perm, best.chromosome.qty),
            routes_payload(problem, best.chromosome.qty, best.decoded),
            best.decoded.total_km,
        )
        assert report["feasible"], report["checks"]
        again = evaluate(problem, best.chromosome.copy(), baseline.d_ref, weights)
        assert again.j == pytest.approx(best.j)
        gaps[seed] = best.j - best_j
    # informativo (no es un requisito): brecha de cada semilla respecto del óptimo
    print("\nBrecha J_AG − J_óptimo por semilla:", {s: round(g, 6) for s, g in gaps.items()})


@pytest.mark.slow
def test_baseline_never_beats_the_exhaustive_optimum_of_its_own_encoding(exhaustive) -> None:
    problem, baseline, best_j, _ = exhaustive
    encoded = evaluate(
        problem, baseline.as_chromosome(problem), baseline.d_ref, STANDARD_PRESET.weights
    )
    assert encoded.j >= best_j - EPS
