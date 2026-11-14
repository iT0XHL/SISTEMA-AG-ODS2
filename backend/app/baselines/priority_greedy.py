"""Línea base heurística determinista y cálculo de ``D_ref`` (plan §3.4).

Regla: atender los centros por **prioridad descendente** (desempate por ID),
asignar hasta agotar capacidad e inventario, y ordenar cada ruta por **vecino más
cercano**.

Detalle de la asignación a vehículos (documentado para que sea reproducible):

* cantidad objetivo = ``min(d_i, max C_v, inventario restante)``;
* va al **primer** vehículo (orden de ID) donde cabe completa;
* si no cabe completa en ninguno, se entrega de forma parcial en el vehículo con
  más espacio libre (desempate por ID); si no queda espacio, el centro no se atiende.

``D_ref`` se calcula **una sola vez** por escenario con esta solución. Si la línea
base no contiene viajes, se usa la convención ``D_ref = 1 km`` únicamente para
normalizar, y se informa la excepción.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.baselines.nearest_neighbor import nearest_neighbor_order
from app.domain.models import Problem
from app.ga.chromosome import Chromosome, Decoded

D_REF_CONVENTION_KM = 1.0


@dataclass(frozen=True)
class Baseline:
    qty: tuple[int, ...]
    decoded: Decoded
    d_ref: float
    d_ref_is_convention: bool  # True si no hubo viajes y se aplicó D_ref = 1 km

    def as_chromosome(self, problem: Problem) -> Chromosome:
        """Codifica la heurística como ``(π, q)``: rutas concatenadas + no atendidos por ID."""
        perm: list[int] = [c for route in self.decoded.routes for c in route]
        served = set(perm)
        perm.extend(i for i in range(problem.n) if i not in served)
        return Chromosome(perm=perm, qty=list(self.qty))


def priority_greedy_assignment(problem: Problem) -> tuple[list[int], list[int]]:
    """Devuelve ``(qty, vehicle_of)`` atendiendo por prioridad descendente."""
    order = sorted(range(problem.n), key=lambda i: (-problem.priority[i], problem.center_ids[i]))
    remaining_inventory = problem.inventory
    remaining_capacity = list(problem.capacities)
    qty = [0] * problem.n
    vehicle_of = [-1] * problem.n

    for i in order:
        target = min(problem.upper[i], remaining_inventory)
        if target <= 0:
            continue
        chosen = next((v for v in range(problem.m) if remaining_capacity[v] >= target), None)
        if chosen is None:
            chosen = max(range(problem.m), key=lambda v: (remaining_capacity[v], -v))
            target = remaining_capacity[chosen]
            if target <= 0:
                continue
        qty[i] = target
        vehicle_of[i] = chosen
        remaining_capacity[chosen] -= target
        remaining_inventory -= target
    return qty, vehicle_of


def compute_baseline(problem: Problem) -> Baseline:
    qty, vehicle_of = priority_greedy_assignment(problem)
    routes: list[list[int]] = []
    for v in range(problem.m):
        members = [i for i in range(problem.n) if vehicle_of[i] == v]
        routes.append(nearest_neighbor_order(problem, members))
    loads = [sum(qty[c] for c in route) for route in routes]
    route_km = [problem.route_km(route) for route in routes]
    total_km = sum(route_km)
    is_convention = total_km <= 0.0
    return Baseline(
        qty=tuple(qty),
        decoded=Decoded(
            vehicle_of=vehicle_of,
            routes=routes,
            loads=loads,
            route_km=route_km,
            total_km=total_km,
        ),
        d_ref=D_REF_CONVENTION_KM if is_convention else total_km,
        d_ref_is_convention=is_convention,
    )
