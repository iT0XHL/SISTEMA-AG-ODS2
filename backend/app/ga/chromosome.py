"""Cromosoma híbrido ``C = (π, q)`` y su fenotipo decodificado.

* ``perm`` (π): permutación de los índices de los ``n`` centros → **orden global de
  visita**. Todos los centros aparecen exactamente una vez, incluso con ``q_i = 0``.
* ``qty`` (q): vector de enteros de longitud ``n`` **indexado por centro** (no por
  posición en π) → lotes a entregar a cada centro.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Motivos de reducción registrados por la reparación.
REASON_DOMAIN = "dominio"  # recorte a [0, min(d_i, max C_v)]
REASON_INVENTORY = "inventario"  # Σq > B
REASON_FLEET = "capacidad_flota"  # Σq > Σ C_v
REASON_PACKING = "empaquetado"  # first-fit decreasing no encontró vehículo


@dataclass
class Chromosome:
    perm: list[int]
    qty: list[int]

    def copy(self) -> Chromosome:
        return Chromosome(self.perm.copy(), self.qty.copy())

    def key(self) -> tuple[tuple[int, ...], tuple[int, ...]]:
        return tuple(self.perm), tuple(self.qty)


@dataclass
class RepairLog:
    """Lotes retirados por la reparación, por motivo y centro (índice → lotes)."""

    reductions: dict[str, dict[int, int]] = field(default_factory=dict)

    def add(self, reason: str, center: int, lots: int) -> None:
        if lots <= 0:
            return
        bucket = self.reductions.setdefault(reason, {})
        bucket[center] = bucket.get(center, 0) + lots

    def lots(self, reason: str | None = None) -> int:
        if reason is not None:
            return sum(self.reductions.get(reason, {}).values())
        return sum(sum(bucket.values()) for bucket in self.reductions.values())

    def copy(self) -> RepairLog:
        return RepairLog({reason: dict(bucket) for reason, bucket in self.reductions.items()})


@dataclass
class Decoded:
    """Fenotipo: plan operativo factible obtenido de un cromosoma."""

    vehicle_of: list[int]  # índice de vehículo por centro, -1 si no se atiende
    routes: list[list[int]]  # por vehículo: índices de centro en orden de visita
    loads: list[int]  # lotes cargados por vehículo
    route_km: list[float]  # km por vehículo (depósito → ... → depósito)
    total_km: float


@dataclass
class Individual:
    """Cromosoma reparado + fenotipo + evaluación."""

    chromosome: Chromosome
    decoded: Decoded
    u: float
    r: float
    h: float
    j: float
    fitness: float
    repair: RepairLog

    def copy(self) -> Individual:
        """Copia exacta (elitismo): mismo genotipo, misma evaluación."""
        d = self.decoded
        return Individual(
            chromosome=self.chromosome.copy(),
            decoded=Decoded(
                vehicle_of=d.vehicle_of.copy(),
                routes=[route.copy() for route in d.routes],
                loads=d.loads.copy(),
                route_km=d.route_km.copy(),
                total_km=d.total_km,
            ),
            u=self.u,
            r=self.r,
            h=self.h,
            j=self.j,
            fitness=self.fitness,
            repair=self.repair.copy(),
        )
