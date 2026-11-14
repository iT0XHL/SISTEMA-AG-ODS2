"""Modelo de dominio del problema de asignación y ruteo.

Aquí vive la *instancia compilada* (``Problem``) sobre la que trabajan el motor
genético y las líneas base. Las unidades son siempre **lotes** (enteros) y
**kilómetros** de una única modalidad por corrida.

Convenciones de índices
-----------------------
* Los centros se ordenan por ID (orden lexicográfico fijo). El centro ``i`` de
  cualquier vector (``demand``, ``priority``, ``qty``...) es ``center_ids[i]``.
* En la matriz de distancias el nodo ``0`` es el depósito y el nodo ``i + 1``
  es el centro ``i``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

EARTH_RADIUS_KM = 6371.0088

DISTANCE_MODE_HAVERSINE = "haversine_demo"
DISTANCE_MODE_ROAD = "road_matrix"
DISTANCE_MODES = (DISTANCE_MODE_HAVERSINE, DISTANCE_MODE_ROAD)

DISTANCE_MODE_LABELS = {
    DISTANCE_MODE_HAVERSINE: (
        "km en línea recta (Haversine); no aptos para planificación de reparto"
    ),
    DISTANCE_MODE_ROAD: "km viales de matriz verificada",
}


class EmptyProblemError(ValueError):
    """Caso vacío explícito: no hay nada que optimizar (sin dividir entre cero)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Weights:
    """Pesos de la función objetivo ``J``. Parámetros experimentales, no institucionales."""

    w_u: float = 0.75
    w_r: float = 0.20
    w_h: float = 0.05


@dataclass(frozen=True)
class Problem:
    """Instancia validada y lista para optimizar."""

    center_ids: tuple[str, ...]
    demand: tuple[int, ...]
    priority: tuple[int, ...]
    vehicle_ids: tuple[str, ...]
    capacities: tuple[int, ...]
    inventory: int
    depot_id: str
    dist: tuple[tuple[float, ...], ...]
    distance_mode: str
    # --- derivados (se calculan en __post_init__) ---
    n: int = field(init=False)
    m: int = field(init=False)
    max_capacity: int = field(init=False)
    fleet_capacity: int = field(init=False)
    upper: tuple[int, ...] = field(init=False)
    weighted_demand: int = field(init=False)
    total_demand: int = field(init=False)
    reduction_order: tuple[int, ...] = field(init=False)
    high_priority: tuple[int, ...] = field(init=False)

    def __post_init__(self) -> None:
        n = len(self.center_ids)
        m = len(self.vehicle_ids)
        if n == 0:
            raise EmptyProblemError("NO_CENTERS", "El escenario no tiene centros.")
        if m == 0:
            raise EmptyProblemError("NO_VEHICLES", "El escenario no tiene vehículos.")
        if len(self.demand) != n or len(self.priority) != n:
            raise ValueError("demand y priority deben tener un valor por centro")
        if len(self.capacities) != m:
            raise ValueError("capacities debe tener un valor por vehículo")
        if len(set(self.center_ids)) != n:
            raise ValueError("IDs de centro duplicados")
        if list(self.center_ids) != sorted(self.center_ids):
            raise ValueError("center_ids debe venir en orden fijo (lexicográfico) de ID")
        if any(d < 0 for d in self.demand):
            raise ValueError("demandas negativas")
        if any(p not in (1, 2, 3) for p in self.priority):
            raise ValueError("prioridades fuera de 1..3")
        if any(c <= 0 for c in self.capacities):
            raise ValueError("capacidades no positivas")
        if self.inventory < 0:
            raise ValueError("inventario negativo")
        if len(self.dist) != n + 1 or any(len(row) != n + 1 for row in self.dist):
            raise ValueError("la matriz de distancias debe ser (n+1) x (n+1)")
        for row in self.dist:
            for km in row:
                if not math.isfinite(km) or km < 0:
                    raise ValueError("la matriz de distancias debe ser finita y no negativa")

        max_cap = max(self.capacities)
        object.__setattr__(self, "n", n)
        object.__setattr__(self, "m", m)
        object.__setattr__(self, "max_capacity", max_cap)
        object.__setattr__(self, "fleet_capacity", sum(self.capacities))
        object.__setattr__(self, "upper", tuple(min(d, max_cap) for d in self.demand))
        object.__setattr__(
            self,
            "weighted_demand",
            sum(p * d for p, d in zip(self.priority, self.demand, strict=True)),
        )
        object.__setattr__(self, "total_demand", sum(self.demand))
        # Orden de reducción de la reparación: menor prioridad primero, desempate por ID fijo.
        object.__setattr__(
            self,
            "reduction_order",
            tuple(sorted(range(n), key=lambda i: (self.priority[i], self.center_ids[i]))),
        )
        # Centros de prioridad alta con demanda (un centro sin demanda no puede quedar desatendido).
        object.__setattr__(
            self,
            "high_priority",
            tuple(i for i in range(n) if self.priority[i] == 3 and self.demand[i] > 0),
        )

    @property
    def delivery_limit(self) -> int:
        """Máximo de lotes que cualquier solución puede entregar: ``min(B, Σ C_v)``."""
        return min(self.inventory, self.fleet_capacity)

    @property
    def is_empty_case(self) -> bool:
        return self.inventory == 0 or self.total_demand == 0

    def route_km(self, route: list[int] | tuple[int, ...]) -> float:
        """Distancia de ``depósito → centros → depósito`` para una lista de índices de centro."""
        if not route:
            return 0.0
        dist = self.dist
        km = dist[0][route[0] + 1]
        for a, b in pairwise(route):
            km += dist[a + 1][b + 1]
        km += dist[route[-1] + 1][0]
        return km


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geodésica en línea recta (km). Solo para simulación."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def build_distance_matrix(scenario: dict[str, Any]) -> tuple[list[str], list[list[float]], str]:
    """Devuelve ``(ids, matriz, fuente)`` con ``ids[0]`` = depósito y centros en orden de ID.

    * ``haversine_demo``: se calcula desde coordenadas (simétrica, diagonal 0).
    * ``road_matrix``: se toma de ``scenario["distances"]`` (puede ser asimétrica).

    Nunca se mezclan modalidades: la matriz completa proviene de un único método.
    """
    centers = sorted(scenario["centers"], key=lambda c: c["id"])
    depot = scenario["depot"]
    ids = [depot["id"]] + [c["id"] for c in centers]
    size = len(ids)
    mode = scenario["distance_mode"]

    if mode == DISTANCE_MODE_HAVERSINE:
        points = [(depot["lat"], depot["lon"])] + [(c["lat"], c["lon"]) for c in centers]
        matrix = [[0.0] * size for _ in range(size)]
        for a in range(size):
            for b in range(a + 1, size):
                km = round(haversine_km(*points[a], *points[b]), 6)
                matrix[a][b] = km
                matrix[b][a] = km
        return ids, matrix, "haversine"

    if mode == DISTANCE_MODE_ROAD:
        index = {node_id: k for k, node_id in enumerate(ids)}
        matrix = [[math.nan] * size for _ in range(size)]
        for k in range(size):
            matrix[k][k] = 0.0
        for entry in scenario.get("distances") or []:
            a, b = index[entry["from_id"]], index[entry["to_id"]]
            matrix[a][b] = round(float(entry["km"]), 6)
        return ids, matrix, scenario.get("distance_source") or "road_csv"

    raise ValueError(f"Modalidad de distancia desconocida: {mode}")


def build_problem(scenario: dict[str, Any], matrix: list[list[float]] | None = None) -> Problem:
    """Compila un escenario **ya validado** (dict normalizado) en un ``Problem``.

    Si se pasa ``matrix`` (la matriz persistida del escenario, con el depósito en el
    índice 0 y los centros en orden de ID) se usa tal cual: así todas las corridas y
    la línea base comparten exactamente la misma matriz.
    """
    centers = sorted(scenario["centers"], key=lambda c: c["id"])
    vehicles = sorted(scenario["vehicles"], key=lambda v: v["id"])
    if matrix is None:
        _, matrix, _ = build_distance_matrix(scenario)
    return Problem(
        center_ids=tuple(c["id"] for c in centers),
        demand=tuple(int(c["demand_lots"]) for c in centers),
        priority=tuple(int(c["priority_weight"]) for c in centers),
        vehicle_ids=tuple(v["id"] for v in vehicles),
        capacities=tuple(int(v["capacity_lots"]) for v in vehicles),
        inventory=int(scenario["inventory_lots"]),
        depot_id=scenario["depot"]["id"],
        dist=tuple(tuple(row) for row in matrix),
        distance_mode=scenario["distance_mode"],
    )
