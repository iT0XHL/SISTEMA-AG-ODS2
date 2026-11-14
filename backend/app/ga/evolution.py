"""Bucle evolutivo del AG (plan §4, pseudocódigo).

    validar escenario y calcular matriz de distancias
    construir línea base determinista y D_ref
    P0 ← población aleatoria + heurística; reparar, decodificar y evaluar
    para t = 1 … G_max:
        nueva ← copias exactas de los `elite` mejores de P(t−1)
        mientras |nueva| < N:
            padres ← torneo(P(t−1), k)
            (π, q) ← OX + uniforme con probabilidad p_c; si no, copias
            mutar π y q; reparar + decodificar + evaluar cada hijo
        P(t) ← nueva; actualizar mejor global, historial y estancamiento
    validar la mejor solución desde cero

Reproducibilidad: un único ``numpy.random.Generator(PCG64(seed))`` alimenta todo el
flujo, sin paralelismo. Igual escenario + semilla + parámetros + versión ⇒ mismo
historial y mismo cromosoma.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from numpy.random import PCG64, Generator

from app.baselines.priority_greedy import Baseline, compute_baseline
from app.domain.models import EmptyProblemError, Problem
from app.ga.chromosome import Chromosome, Individual
from app.ga.crossover import crossover
from app.ga.fitness import evaluate
from app.ga.initialization import initial_chromosomes
from app.ga.mutation import mutate_permutation, mutate_quantities
from app.ga.params import GAParams
from app.ga.selection import tournament

STOP_MAX_GENERATIONS = "max_generations"
STOP_STAGNATION = "stagnation"
STOP_CANCELLED = "cancelled"


@dataclass(frozen=True)
class GenerationRecord:
    number: int
    best_fitness: float
    mean_fitness: float
    best_j: float
    diversity: float  # proporción de permutaciones π distintas en la población


@dataclass
class GAResult:
    best: Individual
    baseline: Baseline
    history: list[GenerationRecord]
    stop_reason: str
    generations_run: int
    evaluations: int
    cpu_seconds: float
    wall_seconds: float
    seed: int
    params: GAParams
    repair_totals: dict[str, int] = field(default_factory=dict)
    individuals_repaired: int = 0


def make_rng(seed: int) -> Generator:
    return Generator(PCG64(seed))


def _record(number: int, population: list[Individual]) -> GenerationRecord:
    best = max(population, key=lambda ind: ind.fitness)
    distinct = len({tuple(ind.chromosome.perm) for ind in population})
    return GenerationRecord(
        number=number,
        best_fitness=best.fitness,
        mean_fitness=sum(ind.fitness for ind in population) / len(population),
        best_j=best.j,
        diversity=distinct / len(population),
    )


def _elites(population: list[Individual], count: int) -> list[Individual]:
    """Los ``count`` mejores (desempate estable por índice), como copias exactas."""
    order = sorted(range(len(population)), key=lambda i: (-population[i].fitness, i))
    return [population[i].copy() for i in order[:count]]


def run_ga(
    problem: Problem,
    params: GAParams,
    seed: int,
    baseline: Baseline | None = None,
    on_generation: Callable[[GenerationRecord], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> GAResult:
    """Ejecuta una corrida completa del AG y devuelve la mejor solución encontrada."""
    params.validate()
    if problem.is_empty_case:
        raise EmptyProblemError(
            "EMPTY_CASE",
            "Caso vacío: sin inventario o sin demanda no hay nada que optimizar.",
        )

    cpu_start = time.process_time()
    wall_start = time.perf_counter()
    baseline = baseline if baseline is not None else compute_baseline(problem)
    d_ref = baseline.d_ref
    weights = params.weights
    rng = make_rng(seed)

    repair_totals: dict[str, int] = {}
    individuals_repaired = 0
    evaluations = 0

    def assess(chromosome: Chromosome) -> Individual:
        nonlocal evaluations, individuals_repaired
        individual = evaluate(problem, chromosome, d_ref, weights)
        evaluations += 1
        if individual.repair.reductions:
            individuals_repaired += 1
            for reason, bucket in individual.repair.reductions.items():
                repair_totals[reason] = repair_totals.get(reason, 0) + sum(bucket.values())
        return individual

    population = [assess(c) for c in initial_chromosomes(rng, problem, baseline, params)]
    history = [_record(0, population)]
    if on_generation:
        on_generation(history[0])

    best_global = max(population, key=lambda ind: ind.fitness).copy()
    stagnation_reference = best_global.fitness
    stagnant = 0
    stop_reason = STOP_MAX_GENERATIONS
    generation = 0

    for generation in range(1, params.max_generations + 1):
        if should_stop and should_stop():
            stop_reason = STOP_CANCELLED
            generation -= 1
            break

        new_population = _elites(population, params.elite)
        while len(new_population) < params.population_size:
            parent_a = tournament(rng, population, params.tournament_k)
            parent_b = tournament(rng, population, params.tournament_k)
            child_a, child_b, _ = crossover(
                rng, parent_a.chromosome, parent_b.chromosome, params.crossover_prob
            )
            for child in (child_a, child_b):
                if len(new_population) >= params.population_size:
                    break
                mutate_permutation(rng, child.perm, params.perm_mutation_prob)
                mutate_quantities(
                    rng, problem, child.qty, params.qty_mutation_prob, params.qty_mutation_max_step
                )
                new_population.append(assess(child))
        population = new_population

        record = _record(generation, population)
        history.append(record)

        generation_best = max(population, key=lambda ind: ind.fitness)
        # Mejora relevante: ≥ tolerancia respecto del último nivel que contó como mejora
        # (así las mejoras diminutas acumuladas no se pierden ni reinician el contador).
        if generation_best.fitness - stagnation_reference >= params.improvement_tolerance:
            stagnant = 0
            stagnation_reference = generation_best.fitness
        else:
            stagnant += 1
        if generation_best.fitness > best_global.fitness:
            best_global = generation_best.copy()

        if on_generation:
            on_generation(record)
        if stagnant >= params.stagnation_generations:
            stop_reason = STOP_STAGNATION
            break

    return GAResult(
        best=best_global,
        baseline=baseline,
        history=history,
        stop_reason=stop_reason,
        generations_run=generation,
        evaluations=evaluations,
        cpu_seconds=time.process_time() - cpu_start,
        wall_seconds=time.perf_counter() - wall_start,
        seed=seed,
        params=params,
        repair_totals=repair_totals,
        individuals_repaired=individuals_repaired,
    )
