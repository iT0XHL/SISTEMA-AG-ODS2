"""Función objetivo ``J`` y fitness (plan §3.4, informe §3).

    U = Σ p_i (d_i − q_i) / max(1, Σ p_i d_i)      demanda ponderada no satisfecha
    R = distancia_total_km / D_ref                  costo relativo de transporte
    H = (# centros p_i = 3 con q_i = 0) / max(1, # centros p_i = 3)

    J = w_U·U + w_R·R + w_H·H        (minimizar; por defecto 0.75 / 0.20 / 0.05)
    fitness = 1 / (1 + J)            (maximizar; siempre > 0)

El fitness se calcula **después** de reparar y decodificar.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.models import Problem, Weights
from app.ga.chromosome import Chromosome, Individual
from app.ga.decoder import decode


@dataclass(frozen=True)
class Components:
    u: float
    r: float
    h: float
    j: float
    fitness: float


def unmet_weighted_demand(problem: Problem, qty: list[int] | tuple[int, ...]) -> float:
    """``U``: fracción de demanda ponderada no satisfecha (0 si el denominador es 0)."""
    unmet = 0
    for p, d, q in zip(problem.priority, problem.demand, qty, strict=True):
        unmet += p * (d - q)
    return unmet / max(1, problem.weighted_demand)


def relative_distance(total_km: float, d_ref: float) -> float:
    """``R``: distancia relativa a la línea base. ``d_ref`` debe ser > 0 (convención 1 km)."""
    if d_ref <= 0:
        raise ValueError("D_ref debe ser > 0 (usar la convención D_ref = 1 km si no hay viajes)")
    return total_km / d_ref


def high_priority_unserved(problem: Problem, qty: list[int] | tuple[int, ...]) -> float:
    """``H``: proporción de centros de prioridad 3 (con demanda) sin entrega."""
    high = problem.high_priority
    if not high:
        return 0.0
    return sum(1 for i in high if qty[i] == 0) / len(high)


def objective(u: float, r: float, h: float, weights: Weights) -> float:
    return weights.w_u * u + weights.w_r * r + weights.w_h * h


def fitness_from_j(j: float) -> float:
    return 1.0 / (1.0 + j)


def components(
    problem: Problem,
    qty: list[int] | tuple[int, ...],
    total_km: float,
    d_ref: float,
    weights: Weights,
) -> Components:
    u = unmet_weighted_demand(problem, qty)
    r = relative_distance(total_km, d_ref)
    h = high_priority_unserved(problem, qty)
    j = objective(u, r, h, weights)
    return Components(u=u, r=r, h=h, j=j, fitness=fitness_from_j(j))


def evaluate(
    problem: Problem, chromosome: Chromosome, d_ref: float, weights: Weights
) -> Individual:
    """Repara + decodifica + evalúa. El cromosoma queda reparado (factible)."""
    decoded, log = decode(problem, chromosome)
    c = components(problem, chromosome.qty, decoded.total_km, d_ref, weights)
    return Individual(
        chromosome=chromosome,
        decoded=decoded,
        u=c.u,
        r=c.r,
        h=c.h,
        j=c.j,
        fitness=c.fitness,
        repair=log,
    )
