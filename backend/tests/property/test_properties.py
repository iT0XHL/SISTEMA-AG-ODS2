"""Pruebas de propiedades (plan §9.2): invariantes sobre instancias y cromosomas aleatorios."""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st
from numpy.random import PCG64, Generator

from app.baselines.priority_greedy import compute_baseline
from app.domain.metrics import chromosome_payload, routes_payload, validate_solution
from app.domain.models import Problem, Weights
from app.ga.chromosome import Chromosome
from app.ga.crossover import order_crossover, uniform_crossover
from app.ga.decoder import decode
from app.ga.fitness import components
from app.ga.mutation import inversion_mutation, mutate_quantities, swap_mutation
from app.ga.repair import repair_quantities
from tests.conftest import make_problem


@st.composite
def problems(draw) -> Problem:
    n = draw(st.integers(1, 9))
    m = draw(st.integers(1, 4))
    demand = draw(st.lists(st.integers(0, 30), min_size=n, max_size=n))
    priority = draw(st.lists(st.sampled_from([1, 2, 3]), min_size=n, max_size=n))
    capacities = draw(st.lists(st.integers(1, 40), min_size=m, max_size=m))
    inventory = draw(st.integers(0, 150))
    size = n + 1
    cells = draw(
        st.lists(
            st.floats(0, 50, allow_nan=False, allow_infinity=False),
            min_size=size * size,
            max_size=size * size,
        )
    )
    dist = [[0.0 if i == j else cells[i * size + j] for j in range(size)] for i in range(size)]
    return make_problem(demand, priority, capacities, inventory, dist)


@st.composite
def problem_with_chromosome(draw) -> tuple[Problem, Chromosome]:
    problem = draw(problems())
    perm = draw(st.permutations(list(range(problem.n))))
    qty = draw(st.lists(st.integers(-10, 80), min_size=problem.n, max_size=problem.n))
    return problem, Chromosome(list(perm), qty)


@given(problem_with_chromosome())
@settings(max_examples=300, deadline=None)
def test_repair_terminates_and_respects_all_limits(case) -> None:
    problem, chromosome = case
    original = chromosome.qty.copy()
    log = repair_quantities(problem, chromosome.qty)
    qty = chromosome.qty
    assert all(0 <= q <= problem.demand[i] for i, q in enumerate(qty))
    assert all(q <= problem.max_capacity for q in qty)
    assert sum(qty) <= problem.inventory and sum(qty) <= problem.fleet_capacity
    # contabilidad exacta: cada lote retirado queda documentado
    removed = sum(max(0, o) - q for o, q in zip(original, qty, strict=True))
    assert log.lots() == removed


@given(problem_with_chromosome())
@settings(max_examples=300, deadline=None)
def test_decoder_always_produces_a_feasible_plan(case) -> None:
    problem, chromosome = case
    decoded, _ = decode(problem, chromosome)
    report = validate_solution(
        problem,
        chromosome_payload(problem, chromosome.perm, chromosome.qty),
        routes_payload(problem, chromosome.qty, decoded),
        decoded.total_km,
    )
    assert report["feasible"], [c for c in report["checks"] if not c["ok"]]
    for v in range(problem.m):
        assert decoded.loads[v] <= problem.capacities[v]
    served = sorted(c for route in decoded.routes for c in route)
    assert served == [i for i in range(problem.n) if chromosome.qty[i] > 0]


@given(problem_with_chromosome())
@settings(max_examples=200, deadline=None)
def test_decoding_a_repaired_chromosome_is_stable(case) -> None:
    problem, chromosome = case
    first, _ = decode(problem, chromosome)
    second, log = decode(problem, chromosome.copy())
    assert log.lots() == 0
    assert second.routes == first.routes and second.vehicle_of == first.vehicle_of


@given(problems())
@settings(max_examples=200, deadline=None)
def test_baseline_is_feasible_and_fitness_is_positive(problem) -> None:
    baseline = compute_baseline(problem)
    chromosome = baseline.as_chromosome(problem)
    report = validate_solution(
        problem,
        chromosome_payload(problem, chromosome.perm, baseline.qty),
        routes_payload(problem, baseline.qty, baseline.decoded),
        baseline.decoded.total_km,
        check_pi_suborder=False,
    )
    assert report["feasible"], [c for c in report["checks"] if not c["ok"]]
    assert baseline.d_ref > 0
    c = components(problem, baseline.qty, baseline.decoded.total_km, baseline.d_ref, Weights())
    assert 0 <= c.u <= 1 and 0 <= c.h <= 1 and c.r >= 0
    assert 0 < c.fitness <= 1 and c.j >= 0


@given(st.integers(0, 2**32 - 1), st.integers(1, 40))
@settings(max_examples=200, deadline=None)
def test_ox_and_permutation_mutations_preserve_the_id_set(seed: int, n: int) -> None:
    rng = Generator(PCG64(seed))
    ids = list(range(n))
    a, b = rng.permutation(n).tolist(), rng.permutation(n).tolist()
    for child in order_crossover(rng, a, b):
        assert sorted(child) == ids
        swap_mutation(rng, child)
        inversion_mutation(rng, child)
        assert sorted(child) == ids


@given(st.integers(0, 2**32 - 1), problems())
@settings(max_examples=200, deadline=None)
def test_uniform_crossover_and_quantity_mutation_properties(seed: int, problem) -> None:
    rng = Generator(PCG64(seed))
    qty_a = [int(rng.integers(0, u + 1)) for u in problem.upper]
    qty_b = [int(rng.integers(0, u + 1)) for u in problem.upper]
    child_a, child_b = uniform_crossover(rng, qty_a, qty_b)
    for i in range(problem.n):
        assert child_a[i] in (qty_a[i], qty_b[i]) and child_b[i] in (qty_a[i], qty_b[i])
        assert child_a[i] + child_b[i] == qty_a[i] + qty_b[i]
    mutate_quantities(rng, problem, child_a, 0.5, 3)
    assert all(0 <= q <= u for q, u in zip(child_a, problem.upper, strict=True))
