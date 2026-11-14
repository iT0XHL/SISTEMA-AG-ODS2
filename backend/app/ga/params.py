"""Parámetros del AG. El preset «Docente» es el contrato operativo del plan (§4)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.domain.models import Weights

OFFICIAL_SEEDS: tuple[int, ...] = (11, 22, 33, 44)


@dataclass(frozen=True)
class GAParams:
    population_size: int = 100
    max_generations: int = 200
    tournament_k: int = 3
    crossover_prob: float = 0.90
    perm_mutation_prob: float = 0.15  # por individuo
    qty_mutation_prob: float = 0.08  # por gen
    qty_mutation_max_step: int = 3  # ±1 … ±3 lotes
    elite: int = 2
    stagnation_generations: int = 35
    improvement_tolerance: float = 1e-6
    init_random_frac: float = 0.70
    init_priority_frac: float = 0.20
    init_heuristic_frac: float = 0.10
    w_u: float = 0.75
    w_r: float = 0.20
    w_h: float = 0.05

    @property
    def weights(self) -> Weights:
        return Weights(self.w_u, self.w_r, self.w_h)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def validate(self) -> None:
        if self.population_size < 4:
            raise ValueError("population_size debe ser ≥ 4")
        if self.max_generations < 1:
            raise ValueError("max_generations debe ser ≥ 1")
        if not 2 <= self.tournament_k <= self.population_size:
            raise ValueError("tournament_k debe estar entre 2 y population_size")
        if not 0 <= self.elite < self.population_size:
            raise ValueError("elite debe estar entre 0 y population_size − 1")
        for name in ("crossover_prob", "perm_mutation_prob", "qty_mutation_prob"):
            if not 0.0 <= getattr(self, name) <= 1.0:
                raise ValueError(f"{name} debe estar en [0, 1]")
        if self.qty_mutation_max_step < 1:
            raise ValueError("qty_mutation_max_step debe ser ≥ 1")
        if self.stagnation_generations < 1:
            raise ValueError("stagnation_generations debe ser ≥ 1")
        if self.improvement_tolerance < 0:
            raise ValueError("improvement_tolerance debe ser ≥ 0")
        fracs = (self.init_random_frac, self.init_priority_frac, self.init_heuristic_frac)
        if any(f < 0 for f in fracs) or abs(sum(fracs) - 1.0) > 1e-9:
            raise ValueError("las fracciones de población inicial deben ser ≥ 0 y sumar 1")
        ws = (self.w_u, self.w_r, self.w_h)
        if any(w < 0 for w in ws) or abs(sum(ws) - 1.0) > 1e-9:
            raise ValueError("los pesos w_u, w_r, w_h deben ser ≥ 0 y sumar 1")


DOCENTE_PRESET = GAParams()
