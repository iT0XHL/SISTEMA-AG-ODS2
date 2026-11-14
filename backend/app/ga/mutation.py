"""Operadores de mutación (plan §4, informe §4).

* π: intercambio de dos centros **o** inversión de una subcadena (``p_π`` por individuo).
* q: cada gen, con probabilidad ``p_q``, varía ±1 … ±``max_step`` lotes, saturado al
  dominio ``[0, min(d_i, max C_v)]``. Nunca crea IDs nuevos ni valores negativos.
"""

from __future__ import annotations

from numpy.random import Generator

from app.domain.models import Problem


def swap_mutation(rng: Generator, perm: list[int]) -> None:
    """Intercambia dos posiciones distintas."""
    n = len(perm)
    if n < 2:
        return
    a = int(rng.integers(n))
    b = int(rng.integers(n - 1))
    if b >= a:
        b += 1
    perm[a], perm[b] = perm[b], perm[a]


def inversion_mutation(rng: Generator, perm: list[int]) -> None:
    """Invierte una subcadena de al menos dos centros."""
    n = len(perm)
    if n < 2:
        return
    a = int(rng.integers(n - 1))
    b = int(rng.integers(a + 2, n + 1))
    perm[a:b] = perm[a:b][::-1]


def mutate_permutation(rng: Generator, perm: list[int], probability: float) -> bool:
    """Con probabilidad ``p_π`` aplica intercambio o inversión (50/50)."""
    if rng.random() >= probability:
        return False
    if rng.random() < 0.5:
        swap_mutation(rng, perm)
    else:
        inversion_mutation(rng, perm)
    return True


def mutate_quantities(
    rng: Generator, problem: Problem, qty: list[int], probability: float, max_step: int = 3
) -> int:
    """Muta cada gen con probabilidad ``p_q``. Devuelve cuántos genes se evaluaron para mutar."""
    hits = rng.random(len(qty)) < probability
    mutated = 0
    upper = problem.upper
    for i, hit in enumerate(hits):
        if not hit:
            continue
        step = int(rng.integers(1, max_step + 1))
        if rng.random() < 0.5:
            step = -step
        qty[i] = min(upper[i], max(0, qty[i] + step))
        mutated += 1
    return mutated
