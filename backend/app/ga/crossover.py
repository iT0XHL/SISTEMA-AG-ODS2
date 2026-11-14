"""Operadores de cruce (plan §4, informe §4).

* π → **Order Crossover (OX)**: el hijo conserva una subcadena de un padre y completa
  el resto con los centros del otro en su orden relativo. Nunca duplica IDs.
* q → **cruce uniforme** gen por gen: el gen del centro ``i`` del hijo procede del
  gen del **mismo centro** ``i`` de uno de los padres (no de una posición de π).

Ambas partes se recombinan bajo el **mismo evento** de cruce.
"""

from __future__ import annotations

from numpy.random import Generator

from app.ga.chromosome import Chromosome


def order_crossover_child(
    keeper: list[int], filler: list[int], cut_a: int, cut_b: int
) -> list[int]:
    """Hijo OX: conserva ``keeper[cut_a:cut_b]`` y rellena con el orden de ``filler``.

    Variante clásica de Davis: el relleno empieza tras el segundo corte y avanza de
    forma circular, tomando de ``filler`` (también desde el segundo corte) los
    centros que aún no están presentes.
    """
    n = len(keeper)
    child = [-1] * n
    child[cut_a:cut_b] = keeper[cut_a:cut_b]
    kept = set(keeper[cut_a:cut_b])
    write = cut_b % n
    for offset in range(n):
        gene = filler[(cut_b + offset) % n]
        if gene not in kept:
            child[write] = gene
            write = (write + 1) % n
    return child


def order_crossover(
    rng: Generator, parent_a: list[int], parent_b: list[int]
) -> tuple[list[int], list[int]]:
    """OX con dos puntos de corte aleatorios. Devuelve dos hijos (permutaciones válidas)."""
    n = len(parent_a)
    if n < 2:
        return parent_a.copy(), parent_b.copy()
    first, second = int(rng.integers(n + 1)), int(rng.integers(n + 1))
    cut_a, cut_b = min(first, second), max(first, second)
    return (
        order_crossover_child(parent_a, parent_b, cut_a, cut_b),
        order_crossover_child(parent_b, parent_a, cut_a, cut_b),
    )


def uniform_crossover(
    rng: Generator, qty_a: list[int], qty_b: list[int]
) -> tuple[list[int], list[int]]:
    """Cruce uniforme: por cada centro ``i`` se decide de qué padre hereda cada hijo."""
    mask = rng.random(len(qty_a)) < 0.5
    child_a = [a if take else b for a, b, take in zip(qty_a, qty_b, mask, strict=True)]
    child_b = [b if take else a for a, b, take in zip(qty_a, qty_b, mask, strict=True)]
    return child_a, child_b


def crossover(
    rng: Generator, parent_a: Chromosome, parent_b: Chromosome, probability: float
) -> tuple[Chromosome, Chromosome, bool]:
    """Con probabilidad ``p_c`` aplica OX + uniforme; en otro caso devuelve copias."""
    if rng.random() >= probability:
        return parent_a.copy(), parent_b.copy(), False
    perm_a, perm_b = order_crossover(rng, parent_a.perm, parent_b.perm)
    qty_a, qty_b = uniform_crossover(rng, parent_a.qty, parent_b.qty)
    return Chromosome(perm_a, qty_a), Chromosome(perm_b, qty_b), True
