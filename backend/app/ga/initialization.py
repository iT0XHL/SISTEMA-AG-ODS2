"""Población inicial mixta (plan §4, informe §6).

* 70 % **aleatoria**: permutación sin repetición y ``q_i ~ U{0 … min(d_i, max C_v)}``.
* 20 % **sesgada por prioridad**: permutación aleatoria y cantidades con piso según
  prioridad (p=3 → ≥ 70 % del tope; p=2 → ≥ 40 %; p=1 → sin piso). No es obligatoria:
  es solo un sesgo de muestreo.
* 10 % **heurística perturbada**: parte de la misma línea base que define ``D_ref`` y
  diversifica posiciones (1–3 mutaciones de π) y cantidades (±1…±3 en ~15 % de genes).

Los porcentajes son decisiones de diseño configurables. Todos los individuos pasan
por la misma reparación + decodificación antes de evaluarse.
"""

from __future__ import annotations

import math

from numpy.random import Generator

from app.baselines.priority_greedy import Baseline
from app.domain.models import Problem
from app.ga.chromosome import Chromosome
from app.ga.mutation import inversion_mutation, mutate_quantities, swap_mutation
from app.ga.params import GAParams

PRIORITY_FLOOR = {1: 0.0, 2: 0.4, 3: 0.7}
HEURISTIC_QTY_PERTURBATION = 0.15


def subpopulation_sizes(params: GAParams) -> tuple[int, int, int]:
    """``(aleatorios, sesgados, heurísticos)`` que suman ``population_size``."""
    size = params.population_size
    heuristic = round(size * params.init_heuristic_frac)
    biased = round(size * params.init_priority_frac)
    heuristic = min(heuristic, size)
    biased = min(biased, size - heuristic)
    return size - heuristic - biased, biased, heuristic


def random_chromosome(rng: Generator, problem: Problem) -> Chromosome:
    perm = rng.permutation(problem.n).tolist()
    qty = [int(rng.integers(0, upper + 1)) for upper in problem.upper]
    return Chromosome(perm, qty)


def priority_biased_chromosome(rng: Generator, problem: Problem) -> Chromosome:
    perm = rng.permutation(problem.n).tolist()
    qty = []
    for upper, priority in zip(problem.upper, problem.priority, strict=True):
        floor = math.ceil(PRIORITY_FLOOR[priority] * upper)
        qty.append(int(rng.integers(floor, upper + 1)))
    return Chromosome(perm, qty)


def perturbed_heuristic_chromosome(
    rng: Generator, problem: Problem, baseline: Baseline, params: GAParams
) -> Chromosome:
    chromosome = baseline.as_chromosome(problem)
    for _ in range(int(rng.integers(1, 4))):
        if rng.random() < 0.5:
            swap_mutation(rng, chromosome.perm)
        else:
            inversion_mutation(rng, chromosome.perm)
    mutate_quantities(
        rng, problem, chromosome.qty, HEURISTIC_QTY_PERTURBATION, params.qty_mutation_max_step
    )
    return chromosome


def initial_chromosomes(
    rng: Generator, problem: Problem, baseline: Baseline, params: GAParams
) -> list[Chromosome]:
    """Genera los cromosomas de ``P(0)`` (aún sin reparar ni evaluar)."""
    n_random, n_biased, n_heuristic = subpopulation_sizes(params)
    population = [random_chromosome(rng, problem) for _ in range(n_random)]
    population += [priority_biased_chromosome(rng, problem) for _ in range(n_biased)]
    population += [
        perturbed_heuristic_chromosome(rng, problem, baseline, params) for _ in range(n_heuristic)
    ]
    return population
