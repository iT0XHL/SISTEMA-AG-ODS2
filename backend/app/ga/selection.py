"""Selección por torneo (plan §4, informe §5).

Se extraen ``k`` individuos distintos al azar y gana el de mayor fitness. En caso de
empate gana el primero extraído, lo que mantiene el procedimiento reproducible.
"""

from __future__ import annotations

from numpy.random import Generator

from app.ga.chromosome import Individual


def sample_distinct(rng: Generator, population_size: int, k: int) -> list[int]:
    """``k`` índices distintos en ``[0, population_size)``, en orden de extracción."""
    if k > population_size:
        raise ValueError("k no puede superar el tamaño de la población")
    chosen: list[int] = []
    while len(chosen) < k:
        candidate = int(rng.integers(population_size))
        if candidate not in chosen:
            chosen.append(candidate)
    return chosen


def tournament(rng: Generator, population: list[Individual], k: int = 3) -> Individual:
    """Devuelve el ganador de un torneo de tamaño ``k`` (mayor fitness gana)."""
    contenders = sample_distinct(rng, len(population), k)
    winner = population[contenders[0]]
    for index in contenders[1:]:
        if population[index].fitness > winner.fitness:
            winner = population[index]
    return winner
