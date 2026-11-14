"""Contratos de entrada de la API (plan §6.1). ``extra='forbid'`` actúa como lista permitida:
cualquier campo no institucional (por ejemplo ``dni`` o ``sexo``) se rechaza con 422.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ga.params import DOCENTE_PRESET, GAParams


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class DepotIn(StrictModel):
    id: str = "DEPOT"
    name: str | None = None
    lat: float | None = None
    lon: float | None = None


class VehicleIn(StrictModel):
    id: str
    capacity_lots: float | None = None


class CenterIn(StrictModel):
    id: str
    name: str = ""
    district: str | None = None
    address: str | None = None
    lat: float | None = None
    lon: float | None = None
    demand_lots: float | None = None
    priority_weight: int | None = 1
    source: Literal["synthetic", "official", "declared"] = "declared"
    demand_origin: Literal["synthetic", "declared", "inferred"] | None = None
    users_aggregate: float | None = None

    @model_validator(mode="after")
    def _default_demand_origin(self) -> CenterIn:
        if self.demand_origin is None:
            self.demand_origin = "synthetic" if self.source == "synthetic" else "declared"
        return self


class DistanceIn(StrictModel):
    from_id: str
    to_id: str
    km: float | None = None


class DemandRuleIn(StrictModel):
    rations_per_user: float = Field(gt=0)
    rations_per_lot: float = Field(gt=0)


class ScenarioIn(StrictModel):
    scenario_id: str | None = Field(default=None, max_length=80, pattern=r"^[\w\-.]+$")
    label: str = Field(default="", max_length=200)
    data_origin: Literal["synthetic", "official", "declared", "mixed"] = "declared"
    distance_mode: Literal["haversine_demo", "road_matrix"] = "haversine_demo"
    distance_source: str | None = Field(default=None, max_length=120)
    depot: DepotIn = Field(default_factory=DepotIn)
    inventory_lots: float | None = None
    vehicles: list[VehicleIn] = Field(default_factory=list, max_length=200)
    centers: list[CenterIn] = Field(default_factory=list, max_length=5000)
    distances: list[DistanceIn] = Field(default_factory=list, max_length=20000)
    data_license: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)
    priority_criterion: str | None = Field(default=None, max_length=1000)
    demand_rule: DemandRuleIn | None = None
    fixture_seed: int | None = None
    demo_generator_note: str | None = None  # aceptado por compatibilidad con el ejemplo del plan

    def to_payload(self) -> dict[str, Any]:
        data = self.model_dump()
        data.pop("demo_generator_note", None)
        return data


class DemoRequest(StrictModel):
    n_centers: int = Field(default=18, ge=15, le=20)
    fixture_seed: int = Field(default=2026, ge=0, le=2**31 - 1)


class GAParamsIn(StrictModel):
    population_size: int = Field(default=DOCENTE_PRESET.population_size, ge=4)
    max_generations: int = Field(default=DOCENTE_PRESET.max_generations, ge=1)
    tournament_k: int = Field(default=DOCENTE_PRESET.tournament_k, ge=2, le=20)
    crossover_prob: float = Field(default=DOCENTE_PRESET.crossover_prob, ge=0, le=1)
    perm_mutation_prob: float = Field(default=DOCENTE_PRESET.perm_mutation_prob, ge=0, le=1)
    qty_mutation_prob: float = Field(default=DOCENTE_PRESET.qty_mutation_prob, ge=0, le=1)
    qty_mutation_max_step: int = Field(default=DOCENTE_PRESET.qty_mutation_max_step, ge=1, le=10)
    elite: int = Field(default=DOCENTE_PRESET.elite, ge=0)
    stagnation_generations: int = Field(default=DOCENTE_PRESET.stagnation_generations, ge=1)
    improvement_tolerance: float = Field(default=DOCENTE_PRESET.improvement_tolerance, ge=0)
    init_random_frac: float = Field(default=DOCENTE_PRESET.init_random_frac, ge=0, le=1)
    init_priority_frac: float = Field(default=DOCENTE_PRESET.init_priority_frac, ge=0, le=1)
    init_heuristic_frac: float = Field(default=DOCENTE_PRESET.init_heuristic_frac, ge=0, le=1)
    w_u: float = Field(default=DOCENTE_PRESET.w_u, ge=0, le=1)
    w_r: float = Field(default=DOCENTE_PRESET.w_r, ge=0, le=1)
    w_h: float = Field(default=DOCENTE_PRESET.w_h, ge=0, le=1)

    def to_params(self) -> GAParams:
        return GAParams(**self.model_dump())


class RunRequest(StrictModel):
    scenario_id: str
    seed: int = Field(default=11, ge=0, le=2**32 - 1)
    parameters: GAParamsIn | None = None


class WeightsIn(StrictModel):
    w_u: float = Field(default=0.75, ge=0, le=1)
    w_r: float = Field(default=0.20, ge=0, le=1)
    w_h: float = Field(default=0.05, ge=0, le=1)


class BaselineRequest(StrictModel):
    scenario_id: str
    weights: WeightsIn | None = None


class FourRunsRequest(StrictModel):
    scenario_id: str
