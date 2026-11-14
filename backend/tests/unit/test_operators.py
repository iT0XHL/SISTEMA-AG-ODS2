"""Pruebas unitarias 1–3 del plan §9.1: OX, cruce uniforme y mutaciones."""

from __future__ import annotations

from numpy.random import PCG64, Generator

from app.ga.chromosome import Chromosome
from app.ga.crossover import (
    crossover,
    order_crossover,
    order_crossover_child,
    uniform_crossover,
)
from app.ga.mutation import (
    inversion_mutation,
    mutate_permutation,
    mutate_quantities,
    swap_mutation,
)
from app.ga.selection import sample_distinct, tournament


def rng(seed: int = 7) -> Generator:
    return Generator(PCG64(seed))


# ------------------------------------------------------------------ 1. OX
def test_ox_known_example() -> None:
    keeper = [0, 1, 2, 3, 4, 5, 6, 7]
    filler = [3, 7, 0, 5, 1, 6, 4, 2]
    child = order_crossover_child(keeper, filler, 2, 5)
    assert child[2:5] == [2, 3, 4]  # subcadena conservada del primer padre
    # relleno circular desde el segundo corte con el orden relativo del otro padre
    assert child == [5, 1, 2, 3, 4, 6, 7, 0]


def test_ox_children_are_permutations_of_same_ids() -> None:
    generator = rng(1)
    for n in (1, 2, 3, 7, 18, 50):
        ids = list(range(n))
        for _ in range(200):
            a = generator.permutation(n).tolist()
            b = generator.permutation(n).tolist()
            child_a, child_b = order_crossover(generator, a, b)
            assert sorted(child_a) == ids, "faltan o sobran IDs en el hijo A"
            assert sorted(child_b) == ids, "faltan o sobran IDs en el hijo B"
            assert len(set(child_a)) == n and len(set(child_b)) == n


def test_ox_keeps_relative_order_of_filler() -> None:
    keeper = [4, 0, 3, 1, 2, 5]
    filler = [5, 4, 3, 2, 1, 0]
    child = order_crossover_child(keeper, filler, 1, 3)  # conserva [0, 3]
    assert child[1:3] == [0, 3]
    expected_cyclic = [g for g in filler[3:] + filler[:3] if g not in (0, 3)]
    rotated = [g for g in child[3:] + child[:3] if g not in (0, 3)]
    assert rotated == expected_cyclic


# ------------------------------------------------- 2. cruce uniforme de q
def test_uniform_crossover_gene_comes_from_same_center_of_a_parent() -> None:
    generator = rng(3)
    for _ in range(300):
        n = int(generator.integers(1, 30))
        # valores disjuntos por padre y por posición: delatan cualquier mezcla de índices
        qty_a = [1000 + i for i in range(n)]
        qty_b = [2000 + i for i in range(n)]
        child_a, child_b = uniform_crossover(generator, qty_a, qty_b)
        for i in range(n):
            assert child_a[i] in (qty_a[i], qty_b[i])
            assert child_b[i] in (qty_a[i], qty_b[i])
            assert {child_a[i], child_b[i]} == {qty_a[i], qty_b[i]}  # complementarios


def test_crossover_event_is_joint_for_pi_and_q() -> None:
    generator = rng(5)
    a = Chromosome([0, 1, 2, 3, 4], [1, 1, 1, 1, 1])
    b = Chromosome([4, 3, 2, 1, 0], [9, 9, 9, 9, 9])
    never_a, never_b, crossed = crossover(generator, a, b, 0.0)
    assert not crossed and never_a.perm == a.perm and never_a.qty == a.qty
    assert never_b.perm == b.perm and never_b.qty == b.qty
    assert never_a.perm is not a.perm and never_a.qty is not a.qty  # son copias

    always_a, always_b, crossed = crossover(generator, a, b, 1.0)
    assert crossed
    assert sorted(always_a.perm) == sorted(always_b.perm) == [0, 1, 2, 3, 4]
    assert all(q in (1, 9) for q in always_a.qty + always_b.qty)
    # el índice de q no depende del orden de π: el gen i de cada hijo viene del gen i
    assert all({x, y} == {1, 9} for x, y in zip(always_a.qty, always_b.qty, strict=True))


# ----------------------------------------------------------- 3. mutación
def test_permutation_mutations_keep_ids(demo_problem) -> None:
    generator = rng(11)
    n = demo_problem.n
    for mutate in (swap_mutation, inversion_mutation):
        for _ in range(500):
            perm = generator.permutation(n).tolist()
            before = perm.copy()
            mutate(generator, perm)
            assert sorted(perm) == list(range(n)), "la mutación creó o perdió IDs"
            assert perm != before, "la mutación debe cambiar el orden"


def test_swap_changes_exactly_two_positions() -> None:
    generator = rng(2)
    perm = list(range(10))
    swap_mutation(generator, perm)
    assert sum(1 for i, g in enumerate(perm) if g != i) == 2


def test_inversion_reverses_a_contiguous_block() -> None:
    generator = rng(4)
    for _ in range(200):
        perm = list(range(12))
        inversion_mutation(generator, perm)
        changed = [i for i, g in enumerate(perm) if g != i]
        lo, hi = changed[0], changed[-1]
        assert perm[lo : hi + 1] == list(range(hi, lo - 1, -1))


def test_mutate_permutation_respects_probability() -> None:
    generator = rng(9)
    perm = list(range(8))
    assert mutate_permutation(generator, perm, 0.0) is False
    assert perm == list(range(8))
    assert mutate_permutation(generator, perm, 1.0) is True
    assert sorted(perm) == list(range(8))


def test_quantity_mutation_stays_in_domain(demo_problem) -> None:
    generator = rng(13)
    upper = demo_problem.upper
    for _ in range(300):
        qty = [int(generator.integers(0, u + 1)) for u in upper]
        before = qty.copy()
        mutate_quantities(generator, demo_problem, qty, 1.0, 3)
        assert len(qty) == demo_problem.n
        for i, value in enumerate(qty):
            assert isinstance(value, int)
            assert 0 <= value <= upper[i], "valor negativo o por encima del dominio"
            assert abs(value - before[i]) <= 3, "paso mayor que ±3 lotes"


def test_quantity_mutation_zero_probability_is_identity(demo_problem) -> None:
    generator = rng(1)
    qty = list(demo_problem.upper)
    assert mutate_quantities(generator, demo_problem, qty, 0.0) == 0
    assert qty == list(demo_problem.upper)


# -------------------------------------------------------------- selección
def test_sample_distinct_returns_k_different_indices() -> None:
    generator = rng(8)
    for _ in range(200):
        chosen = sample_distinct(generator, 10, 3)
        assert len(set(chosen)) == 3 and all(0 <= c < 10 for c in chosen)


def test_tournament_picks_the_fittest_of_the_population_when_k_is_n() -> None:
    class Fake:
        def __init__(self, fitness: float) -> None:
            self.fitness = fitness

    generator = rng(6)
    population = [Fake(f) for f in (0.2, 0.9, 0.5, 0.7)]
    for _ in range(20):
        assert tournament(generator, population, k=4).fitness == 0.9


def test_tournament_is_reproducible_with_seed() -> None:
    class Fake:
        def __init__(self, fitness: float) -> None:
            self.fitness = fitness

    population = [Fake(i / 50) for i in range(50)]
    picks_a = [tournament(rng(21), population, 3).fitness for _ in range(1)]
    picks_b = [tournament(rng(21), population, 3).fitness for _ in range(1)]
    assert picks_a == picks_b
