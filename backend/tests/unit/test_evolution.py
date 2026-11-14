"""Prueba unitaria 7 del plan §9.1 (reproducibilidad) y contrato operativo del AG (§4)."""

from __future__ import annotations

from dataclasses import replace
from itertools import pairwise

import pytest

from app.baselines.priority_greedy import compute_baseline
from app.domain.metrics import chromosome_payload, routes_payload, validate_solution
from app.domain.models import EmptyProblemError
from app.ga.evolution import (
    STOP_CANCELLED,
    STOP_MAX_GENERATIONS,
    STOP_STAGNATION,
    make_rng,
    run_ga,
)
from app.ga.fitness import evaluate
from app.ga.initialization import initial_chromosomes, subpopulation_sizes
from app.ga.params import DOCENTE_PRESET, OFFICIAL_SEEDS, GAParams
from tests.conftest import make_problem

FAST = replace(DOCENTE_PRESET, population_size=40, max_generations=40)


def test_docente_preset_matches_the_plan() -> None:
    p = DOCENTE_PRESET
    assert (p.population_size, p.max_generations, p.tournament_k, p.elite) == (100, 200, 3, 2)
    assert (p.crossover_prob, p.perm_mutation_prob, p.qty_mutation_prob) == (0.90, 0.15, 0.08)
    assert (p.stagnation_generations, p.improvement_tolerance) == (35, 1e-6)
    assert (p.w_u, p.w_r, p.w_h) == (0.75, 0.20, 0.05)
    assert subpopulation_sizes(p) == (70, 20, 10)
    assert OFFICIAL_SEEDS == (11, 22, 33, 44)


def test_same_seed_same_history_and_chromosome(demo_problem) -> None:
    first = run_ga(demo_problem, FAST, seed=11)
    second = run_ga(demo_problem, FAST, seed=11)
    assert first.best.chromosome.key() == second.best.chromosome.key()
    assert first.history == second.history  # mismo historial, generación a generación
    assert first.best.j == second.best.j and first.stop_reason == second.stop_reason
    assert first.evaluations == second.evaluations


def test_different_seeds_explore_differently(demo_problem) -> None:
    a = run_ga(demo_problem, FAST, seed=11)
    b = run_ga(demo_problem, FAST, seed=22)
    assert a.history != b.history


def test_initial_population_composition_and_validity(demo_problem) -> None:
    baseline = compute_baseline(demo_problem)
    chromosomes = initial_chromosomes(make_rng(11), demo_problem, baseline, DOCENTE_PRESET)
    assert len(chromosomes) == 100
    ids = list(range(demo_problem.n))
    for chromosome in chromosomes:
        assert sorted(chromosome.perm) == ids
        assert len(chromosome.qty) == demo_problem.n
        assert all(0 <= q <= u for q, u in zip(chromosome.qty, demo_problem.upper, strict=True))
    # el bloque sesgado (posiciones 70–89) respeta el piso por prioridad
    for chromosome in chromosomes[70:90]:
        for q, upper, priority in zip(
            chromosome.qty, demo_problem.upper, demo_problem.priority, strict=True
        ):
            if priority == 3:
                assert q >= 0.7 * upper
            elif priority == 2:
                assert q >= 0.4 * upper
    assert len({tuple(c.perm) for c in chromosomes}) > 80  # población diversa


def test_elitism_makes_best_fitness_monotone(demo_problem) -> None:
    result = run_ga(demo_problem, FAST, seed=33)
    best = [record.best_fitness for record in result.history]
    assert all(later >= earlier for earlier, later in pairwise(best))
    assert result.best.fitness == pytest.approx(max(best))
    assert all(
        0 < r.diversity <= 1 and 0 < r.mean_fitness <= r.best_fitness for r in result.history
    )
    assert [r.number for r in result.history] == list(range(len(result.history)))


def test_best_solution_is_feasible_and_reevaluates_identically(demo_problem) -> None:
    result = run_ga(demo_problem, FAST, seed=44)
    best = result.best
    again = evaluate(demo_problem, best.chromosome.copy(), result.baseline.d_ref, FAST.weights)
    assert again.repair.lots() == 0
    assert again.j == pytest.approx(best.j) and again.decoded.routes == best.decoded.routes
    report = validate_solution(
        demo_problem,
        chromosome_payload(demo_problem, best.chromosome.perm, best.chromosome.qty),
        routes_payload(demo_problem, best.chromosome.qty, best.decoded),
        best.decoded.total_km,
    )
    assert report["feasible"], report["checks"]


def test_stop_by_max_generations(demo_problem) -> None:
    params = replace(FAST, max_generations=6, stagnation_generations=1000)
    result = run_ga(demo_problem, params, seed=1)
    assert result.stop_reason == STOP_MAX_GENERATIONS
    assert result.generations_run == 6 and len(result.history) == 7
    assert result.evaluations == 40 + 6 * 38  # P0 + (N − élite) hijos por generación


def test_stop_by_stagnation(demo_problem) -> None:
    params = replace(FAST, max_generations=500, stagnation_generations=5)
    result = run_ga(demo_problem, params, seed=1)
    assert result.stop_reason == STOP_STAGNATION
    assert result.generations_run < 500
    tail = [r.best_fitness for r in result.history[-6:]]
    assert max(tail) - min(tail) < 1e-6  # 5 generaciones sin mejora ≥ 1e-6


def test_cancellation_and_progress_callback(demo_problem) -> None:
    seen: list[int] = []
    result = run_ga(
        demo_problem,
        FAST,
        seed=5,
        on_generation=lambda record: seen.append(record.number),
        should_stop=lambda: len(seen) >= 4,
    )
    assert result.stop_reason == STOP_CANCELLED
    assert seen == [0, 1, 2, 3] and result.generations_run == 3


def test_empty_cases_abort_without_division_by_zero() -> None:
    flat = [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    with pytest.raises(EmptyProblemError) as no_inventory:
        run_ga(make_problem([5, 5], [1, 2], [10], 0, flat), FAST, seed=1)
    assert no_inventory.value.code == "EMPTY_CASE"
    with pytest.raises(EmptyProblemError):
        run_ga(make_problem([0, 0], [1, 2], [10], 10, flat), FAST, seed=1)
    with pytest.raises(EmptyProblemError) as no_centers:
        make_problem([], [], [10], 10, [[0]])
    assert no_centers.value.code == "NO_CENTERS"
    with pytest.raises(EmptyProblemError) as no_vehicles:
        make_problem([5], [1], [], 10, [[0, 1], [1, 0]])
    assert no_vehicles.value.code == "NO_VEHICLES"


def test_invalid_matrix_is_rejected_by_the_problem() -> None:
    with pytest.raises(ValueError):
        make_problem([5, 5], [1, 2], [10], 10, [[0, 1, 1], [1, 0, 1]])  # no cuadrada
    with pytest.raises(ValueError):
        make_problem([5, 5], [1, 2], [10], 10, [[0, -1, 1], [1, 0, 1], [1, 1, 0]])  # negativa
    with pytest.raises(ValueError):
        make_problem([5, 5], [1, 2], [10], 10, [[0, float("nan"), 1], [1, 0, 1], [1, 1, 0]])


@pytest.mark.parametrize(
    "changes",
    [
        {"population_size": 2},
        {"tournament_k": 1},
        {"elite": 100},
        {"crossover_prob": 1.5},
        {"qty_mutation_prob": -0.1},
        {"w_u": 0.9},  # los pesos dejan de sumar 1
        {"init_random_frac": 0.9},  # las fracciones dejan de sumar 1
        {"max_generations": 0},
    ],
)
def test_invalid_parameters_are_rejected(changes: dict) -> None:
    with pytest.raises(ValueError):
        replace(DOCENTE_PRESET, **changes).validate()


def test_ga_works_on_single_center_instance() -> None:
    problem = make_problem([4], [3], [5], 3, [[0, 2], [2, 0]])
    result = run_ga(problem, GAParams(population_size=10, max_generations=5), seed=3)
    assert result.best.chromosome.qty == [3]  # entrega todo el inventario disponible
    assert result.best.decoded.total_km == 4
