"""Decodificación cromosoma → rutas factibles (plan §3.2).

Pasos:

1. Reparar cantidades (dominio, inventario, capacidad agregada).
2. Empaquetar por capacidad con *first-fit decreasing* por ``q_i`` (desempate por
   posición en π): cada entrega va al **primer** vehículo con espacio suficiente.
3. Si el empaquetado falla, quitar un lote al centro de menor prioridad y
   reintentar hasta obtener rutas viables (cada lote queda registrado).
4. Ordenar los centros de cada vehículo con el **suborden de π**; agregar el
   depósito al inicio y al fin; sumar distancias desde ``D``.

``decode`` es una función pura del cromosoma (no usa aleatoriedad): el mismo
``(π, q)`` produce siempre el mismo plan.
"""

from __future__ import annotations

from app.domain.models import Problem
from app.ga.chromosome import REASON_PACKING, Chromosome, Decoded, RepairLog
from app.ga.repair import reduce_lowest_priority, repair_quantities


def first_fit_decreasing(problem: Problem, position: list[int], qty: list[int]) -> list[int] | None:
    """Asigna vehículo a cada centro con ``q_i > 0``. Devuelve ``None`` si alguno no cabe."""
    items = [i for i in range(problem.n) if qty[i] > 0]
    items.sort(key=lambda i: (-qty[i], position[i]))
    remaining = list(problem.capacities)
    vehicle_of = [-1] * problem.n
    for i in items:
        need = qty[i]
        for v in range(problem.m):
            if remaining[v] >= need:
                remaining[v] -= need
                vehicle_of[i] = v
                break
        else:
            return None
    return vehicle_of


def decode(problem: Problem, chromosome: Chromosome) -> tuple[Decoded, RepairLog]:
    """Repara ``chromosome.qty`` *in situ* y devuelve el plan factible y el registro."""
    perm, qty = chromosome.perm, chromosome.qty
    log = repair_quantities(problem, qty)

    position = [0] * problem.n
    for pos, center in enumerate(perm):
        position[center] = pos

    vehicle_of = first_fit_decreasing(problem, position, qty)
    while vehicle_of is None:
        removed = reduce_lowest_priority(problem, qty, 1)
        if not removed:  # no queda nada que reducir: plan vacío, trivialmente factible
            vehicle_of = [-1] * problem.n
            break
        log.add(REASON_PACKING, removed[0][0], 1)
        vehicle_of = first_fit_decreasing(problem, position, qty)

    routes: list[list[int]] = [[] for _ in range(problem.m)]
    for center in perm:  # recorrer π preserva el suborden dentro de cada vehículo
        v = vehicle_of[center]
        if v >= 0:
            routes[v].append(center)

    loads = [sum(qty[c] for c in route) for route in routes]
    route_km = [problem.route_km(route) for route in routes]
    return (
        Decoded(
            vehicle_of=vehicle_of,
            routes=routes,
            loads=loads,
            route_km=route_km,
            total_km=sum(route_km),
        ),
        log,
    )
