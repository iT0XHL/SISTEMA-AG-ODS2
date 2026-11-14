"""Validación y normalización de escenarios (plan §2.1, §3.1, §6, HU-03).

Un escenario solo puede guardarse y ejecutarse si ``errors`` queda vacío: no se
permite correr el AG sin inventario, demandas, flota, depósito y matriz válidos.
Las *advertencias* no bloquean, pero deben mostrarse (por ejemplo, km en línea recta).
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Any

from app.domain.models import (
    DISTANCE_MODE_HAVERSINE,
    DISTANCE_MODE_LABELS,
    DISTANCE_MODE_ROAD,
    DISTANCE_MODES,
    build_distance_matrix,
)

SCENARIO_SCHEMA_VERSION = "1.0"
DATA_ORIGINS = ("synthetic", "official", "declared", "mixed")
CENTER_SOURCES = ("synthetic", "official", "declared")
DEMAND_ORIGINS = ("synthetic", "declared", "inferred")
SYMMETRY_TOLERANCE_KM = 1e-6


@dataclass(frozen=True)
class Limits:
    min_centers: int = 5
    max_centers: int = 50
    max_vehicles: int = 20


class Issues:
    def __init__(self) -> None:
        self.errors: list[dict[str, Any]] = []
        self.warnings: list[dict[str, Any]] = []

    def error(self, code: str, message: str, field: str | None = None, **details: Any) -> None:
        self.errors.append({"code": code, "message": message, "field": field, "details": details})

    def warn(self, code: str, message: str, field: str | None = None, **details: Any) -> None:
        self.warnings.append({"code": code, "message": message, "field": field, "details": details})


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_finite(value: Any) -> bool:
    return _is_number(value) and math.isfinite(value)


def _is_integer(value: Any) -> bool:
    return _is_finite(value) and float(value).is_integer()


def _clean(text: Any) -> str:
    return " ".join(str(text).split()) if text is not None else ""


def _check_coordinates(
    issues: Issues, lat: Any, lon: Any, field: str, label: str, required: bool
) -> None:
    if lat is None and lon is None:
        if required:
            issues.error(
                "MISSING_COORDINATES",
                f"{label}: faltan latitud y longitud. La modalidad Haversine las necesita; "
                "con matriz vial son opcionales.",
                field,
            )
        return
    if lat is None or lon is None:
        issues.error(
            "INCOMPLETE_COORDINATES",
            f"{label}: indique latitud y longitud juntas, o deje ambas vacías.",
            field,
        )
        return
    if not _is_finite(lat) or not -90 <= lat <= 90:
        issues.error(
            "INVALID_LATITUDE",
            f"{label}: la latitud debe ser un número entre -90 y 90.",
            f"{field}.lat",
            value=repr(lat),
        )
    if not _is_finite(lon) or not -180 <= lon <= 180:
        issues.error(
            "INVALID_LONGITUDE",
            f"{label}: la longitud debe ser un número entre -180 y 180.",
            f"{field}.lon",
            value=repr(lon),
        )


def _validate_centers(issues: Issues, centers: list[dict], mode: str, limits: Limits) -> None:
    n = len(centers)
    if n == 0:
        issues.error("NO_CENTERS", "El escenario no tiene centros (n = 0).", "centers")
        return
    if not limits.min_centers <= n <= limits.max_centers:
        issues.error(
            "CENTER_COUNT_OUT_OF_RANGE",
            f"El MVP admite entre {limits.min_centers} y {limits.max_centers} centros; "
            f"el escenario tiene {n}.",
            "centers",
            count=n,
        )
    seen: dict[str, int] = {}
    for k, center in enumerate(centers):
        field = f"centers[{k}]"
        cid = _clean(center.get("id"))
        label = f"Centro {cid or k + 1}"
        if not cid:
            issues.error(
                "MISSING_CENTER_ID", f"Fila {k + 1}: falta el ID del centro.", f"{field}.id"
            )
        elif cid in seen:
            issues.error(
                "DUPLICATE_CENTER_ID",
                f"El ID «{cid}» está duplicado (filas {seen[cid] + 1} y {k + 1}).",
                f"{field}.id",
            )
        else:
            seen[cid] = k
        if not _clean(center.get("name")):
            issues.error(
                "MISSING_CENTER_NAME", f"{label}: falta el nombre institucional.", f"{field}.name"
            )

        demand = center.get("demand_lots")
        if demand is None:
            issues.error(
                "MISSING_DEMAND",
                f"{label}: falta la demanda en lotes. Cárguela o derive una regla declarada.",
                f"{field}.demand_lots",
            )
        elif not _is_integer(demand) or demand < 0:
            issues.error(
                "INVALID_DEMAND",
                f"{label}: la demanda debe ser un entero ≥ 0 (lotes por período).",
                f"{field}.demand_lots",
                value=repr(demand),
            )
        elif demand == 0:
            issues.warn(
                "ZERO_DEMAND",
                f"{label}: demanda 0; permanecerá en π pero no entrará en ninguna ruta.",
                f"{field}.demand_lots",
            )

        priority = center.get("priority_weight")
        if priority not in (1, 2, 3) or isinstance(priority, bool):
            issues.error(
                "INVALID_PRIORITY",
                f"{label}: la prioridad debe ser 1, 2 o 3.",
                f"{field}.priority_weight",
                value=repr(priority),
            )

        if center.get("source") not in CENTER_SOURCES:
            issues.error(
                "INVALID_SOURCE",
                f"{label}: el origen del dato debe ser synthetic, official o declared.",
                f"{field}.source",
            )
        if center.get("demand_origin") not in DEMAND_ORIGINS:
            issues.error(
                "INVALID_DEMAND_ORIGIN",
                f"{label}: el origen de la demanda debe ser synthetic, declared o inferred.",
                f"{field}.demand_origin",
            )
        users = center.get("users_aggregate")
        if users is not None and (not _is_integer(users) or users < 0):
            issues.error(
                "INVALID_USERS_AGGREGATE",
                f"{label}: el número agregado de usuarios debe ser un entero ≥ 0.",
                f"{field}.users_aggregate",
            )
        _check_coordinates(
            issues,
            center.get("lat"),
            center.get("lon"),
            field,
            label,
            required=mode == DISTANCE_MODE_HAVERSINE,
        )


def _validate_fleet(issues: Issues, vehicles: list[dict], limits: Limits) -> None:
    if not vehicles:
        issues.error("NO_VEHICLES", "No hay vehículos: defina al menos uno.", "vehicles")
        return
    if len(vehicles) > limits.max_vehicles:
        issues.error(
            "TOO_MANY_VEHICLES",
            f"El MVP admite hasta {limits.max_vehicles} vehículos.",
            "vehicles",
        )
    seen: set[str] = set()
    for k, vehicle in enumerate(vehicles):
        field = f"vehicles[{k}]"
        vid = _clean(vehicle.get("id"))
        if not vid:
            issues.error("MISSING_VEHICLE_ID", f"Vehículo {k + 1}: falta el ID.", f"{field}.id")
        elif vid in seen:
            issues.error(
                "DUPLICATE_VEHICLE_ID", f"El ID de vehículo «{vid}» está duplicado.", f"{field}.id"
            )
        seen.add(vid)
        capacity = vehicle.get("capacity_lots")
        if not _is_integer(capacity) or capacity <= 0:
            issues.error(
                "INVALID_CAPACITY",
                f"Vehículo {vid or k + 1}: la capacidad debe ser un entero positivo de lotes "
                "(no se admite 0 ni valores negativos).",
                f"{field}.capacity_lots",
                value=repr(capacity),
            )


def _validate_distances(issues: Issues, scenario: dict, node_ids: list[str]) -> dict[str, Any]:
    """Valida la matriz vial declarada. Devuelve un resumen (entradas, simetría)."""
    entries = scenario.get("distances") or []
    summary: dict[str, Any] = {"entries": len(entries), "symmetric": None}
    if not entries:
        issues.error(
            "MISSING_MATRIX",
            "La modalidad «matriz vial» requiere cargar la matriz de distancias completa (CSV).",
            "distances",
        )
        return summary
    known = set(node_ids)
    values: dict[tuple[str, str], float] = {}
    for k, entry in enumerate(entries):
        field = f"distances[{k}]"
        a, b, km = _clean(entry.get("from_id")), _clean(entry.get("to_id")), entry.get("km")
        if a not in known or b not in known:
            unknown = a if a not in known else b
            issues.error(
                "UNKNOWN_DISTANCE_ID",
                f"La matriz menciona «{unknown}», que no es el depósito ni un centro del "
                "escenario.",
                field,
            )
            continue
        if not _is_finite(km):
            issues.error(
                "NON_FINITE_DISTANCE",
                f"Distancia {a} → {b}: el valor debe ser un número finito (no NaN/Inf).",
                f"{field}.km",
                value=repr(km),
            )
            continue
        if km < 0:
            issues.error(
                "NEGATIVE_DISTANCE",
                f"Distancia {a} → {b}: no se admiten km negativos.",
                f"{field}.km",
                value=km,
            )
            continue
        if a == b:
            if km != 0:
                issues.error(
                    "NONZERO_DIAGONAL",
                    f"Distancia {a} → {a}: la diagonal debe ser 0 km.",
                    f"{field}.km",
                )
            continue
        if (a, b) in values and abs(values[(a, b)] - km) > SYMMETRY_TOLERANCE_KM:
            issues.error(
                "CONFLICTING_DISTANCE",
                f"Distancia {a} → {b}: aparece dos veces con valores distintos.",
                field,
            )
            continue
        values[(a, b)] = float(km)

    missing = [(a, b) for a in node_ids for b in node_ids if a != b and (a, b) not in values]
    if missing:
        sample = ", ".join(f"{a}→{b}" for a, b in missing[:5])
        issues.error(
            "MATRIX_INCOMPLETE",
            f"Matriz incompleta: faltan {len(missing)} de {len(node_ids) * (len(node_ids) - 1)} "
            f"pares ordenados (p. ej. {sample}). Se necesitan todos los pares depósito/centro.",
            "distances",
            missing_count=len(missing),
        )
    else:
        summary["symmetric"] = all(
            abs(values[(a, b)] - values[(b, a)]) <= SYMMETRY_TOLERANCE_KM for (a, b) in values
        )
    return summary


def normalize_scenario(payload: dict[str, Any], sort: bool = True) -> dict[str, Any]:
    """Forma canónica: textos limpios, orden por ID y solo campos permitidos."""
    depot = payload.get("depot") or {}
    centers = [
        {
            "id": _clean(c.get("id")),
            "name": _clean(c.get("name")),
            "district": _clean(c.get("district")) or None,
            "address": _clean(c.get("address")) or None,
            "lat": c.get("lat"),
            "lon": c.get("lon"),
            "demand_lots": c.get("demand_lots"),
            "priority_weight": c.get("priority_weight"),
            "source": c.get("source"),
            "demand_origin": c.get("demand_origin"),
            "users_aggregate": c.get("users_aggregate"),
        }
        for c in payload.get("centers") or []
    ]
    vehicles = [
        {"id": _clean(v.get("id")), "capacity_lots": v.get("capacity_lots")}
        for v in payload.get("vehicles") or []
    ]
    distances = [
        {
            "from_id": _clean(e.get("from_id")),
            "to_id": _clean(e.get("to_id")),
            "km": e.get("km"),
        }
        for e in payload.get("distances") or []
    ]
    return {
        "scenario_id": _clean(payload.get("scenario_id")) or None,
        "label": _clean(payload.get("label")),
        "data_origin": payload.get("data_origin"),
        "distance_mode": payload.get("distance_mode"),
        "distance_source": _clean(payload.get("distance_source")) or None,
        "depot": {
            "id": _clean(depot.get("id")) or "DEPOT",
            "name": _clean(depot.get("name")) or None,
            "lat": depot.get("lat"),
            "lon": depot.get("lon"),
        },
        "inventory_lots": payload.get("inventory_lots"),
        "vehicles": sorted(vehicles, key=lambda v: v["id"]) if sort else vehicles,
        "centers": sorted(centers, key=lambda c: c["id"]) if sort else centers,
        "distances": distances,
        "data_license": _clean(payload.get("data_license")) or None,
        "notes": _clean(payload.get("notes")) or None,
        "priority_criterion": _clean(payload.get("priority_criterion")) or None,
        "demand_rule": payload.get("demand_rule"),
        "fixture_seed": payload.get("fixture_seed"),
    }


def scenario_hash(scenario: dict[str, Any], node_ids: list[str], matrix: list[list[float]]) -> str:
    """SHA-256 de todo lo que afecta al resultado: centros, flota, inventario y matriz."""
    canonical = {
        "schema": SCENARIO_SCHEMA_VERSION,
        "distance_mode": scenario["distance_mode"],
        "depot": [scenario["depot"]["id"], scenario["depot"]["lat"], scenario["depot"]["lon"]],
        "inventory_lots": int(scenario["inventory_lots"]),
        "vehicles": [[v["id"], int(v["capacity_lots"])] for v in scenario["vehicles"]],
        "centers": [
            [c["id"], c["lat"], c["lon"], int(c["demand_lots"]), int(c["priority_weight"])]
            for c in scenario["centers"]
        ],
        "node_ids": node_ids,
        "matrix_km": [[round(km, 6) for km in row] for row in matrix],
    }
    blob = json.dumps(canonical, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def validate_scenario(payload: dict[str, Any], limits: Limits | None = None) -> dict[str, Any]:
    """Valida un escenario. Devuelve informe con ``valid``, errores, advertencias y banderas."""
    limits = limits or Limits()
    issues = Issues()
    scenario = normalize_scenario(payload)
    mode = scenario["distance_mode"]
    # Las comprobaciones recorren centros y vehículos en el orden recibido, para que el campo
    # de cada error (``centers[k]``) señale la fila que el usuario tiene delante.
    received = normalize_scenario(payload, sort=False)
    centers, vehicles, depot = received["centers"], received["vehicles"], scenario["depot"]

    if not scenario["label"]:
        issues.error("MISSING_LABEL", "Asigne un nombre al escenario.", "label")
    if scenario["data_origin"] not in DATA_ORIGINS:
        issues.error(
            "INVALID_DATA_ORIGIN",
            "El origen de datos debe ser synthetic, official, declared o mixed.",
            "data_origin",
        )
    if mode not in DISTANCE_MODES:
        issues.error(
            "INVALID_DISTANCE_MODE",
            "La modalidad de distancia debe ser haversine_demo o road_matrix.",
            "distance_mode",
        )

    _validate_centers(issues, centers, mode, limits)
    _validate_fleet(issues, vehicles, limits)

    center_ids = {c["id"] for c in centers}
    if depot["id"] in center_ids:
        issues.error(
            "DEPOT_ID_COLLISION",
            f"El ID del depósito «{depot['id']}» coincide con el de un centro.",
            "depot.id",
        )
    _check_coordinates(
        issues,
        depot.get("lat"),
        depot.get("lon"),
        "depot",
        "Depósito",
        required=mode == DISTANCE_MODE_HAVERSINE,
    )

    inventory = scenario["inventory_lots"]
    if inventory is None:
        issues.error(
            "MISSING_INVENTORY", "Falta el inventario total en lotes (B).", "inventory_lots"
        )
    elif not _is_integer(inventory) or inventory < 0:
        issues.error(
            "INVALID_INVENTORY",
            "El inventario debe ser un entero ≥ 0 (lotes).",
            "inventory_lots",
            value=repr(inventory),
        )
    elif inventory == 0:
        issues.error(
            "EMPTY_INVENTORY",
            "Caso vacío: con inventario B = 0 no hay lotes que asignar ni rutas que trazar. "
            "Cargue un inventario positivo para ejecutar el AG.",
            "inventory_lots",
        )

    demands = [c["demand_lots"] for c in centers]
    demands_ok = bool(centers) and all(_is_integer(d) and d >= 0 for d in demands)
    if demands_ok and sum(demands) == 0:
        issues.error(
            "EMPTY_DEMAND",
            "Caso vacío: todos los centros tienen demanda 0, no hay nada que optimizar.",
            "centers",
        )

    matrix_summary: dict[str, Any] = {"entries": 0, "symmetric": None}
    node_ids = [depot["id"]] + [c["id"] for c in centers]
    if mode == DISTANCE_MODE_HAVERSINE:
        if scenario["distances"]:
            issues.error(
                "MIXED_DISTANCE_SOURCES",
                "La modalidad Haversine calcula todas las distancias desde coordenadas: retire la "
                "matriz cargada o cambie a «matriz vial». Nunca se mezclan km viales con km en "
                "línea recta en una misma corrida.",
                "distances",
            )
        issues.warn(
            "STRAIGHT_LINE_DISTANCES",
            "Distancias en línea recta (Haversine): solo simulación; no aptas para planificar "
            "repartos reales.",
            "distance_mode",
        )
        matrix_summary = {"entries": len(node_ids) * (len(node_ids) - 1), "symmetric": True}
    elif mode == DISTANCE_MODE_ROAD:
        matrix_summary = _validate_distances(issues, scenario, node_ids)

    # --- advertencias de interpretación -------------------------------------------------
    capacities = [v["capacity_lots"] for v in vehicles]
    fleet_ok = bool(vehicles) and all(_is_integer(c) and c > 0 for c in capacities)
    flags: dict[str, Any] = {"structural_scarcity": None, "partial_only_centers": []}
    summary: dict[str, Any] = {
        "n_centers": len(centers),
        "n_vehicles": len(vehicles),
        "distance_mode": mode,
        "distance_mode_label": DISTANCE_MODE_LABELS.get(mode),
        "matrix": matrix_summary,
    }
    if demands_ok and fleet_ok and _is_integer(inventory) and inventory >= 0:
        max_capacity = int(max(capacities))
        fleet_capacity = int(sum(capacities))
        total_demand = int(sum(demands))
        deliverable = min(
            int(inventory), fleet_capacity, sum(min(d, max_capacity) for d in demands)
        )
        partial_only = [c["id"] for c in centers if c["demand_lots"] > max_capacity]
        flags["partial_only_centers"] = partial_only
        for cid in partial_only:
            issues.warn(
                "DEMAND_EXCEEDS_VEHICLE",
                f"Centro {cid}: su demanda supera la capacidad del mayor vehículo "
                f"({max_capacity} lotes). Solo recibirá entrega parcial: el prototipo no programa "
                "varios viajes al mismo centro.",
                "centers",
            )
        scarcity = total_demand > min(int(inventory), fleet_capacity)
        flags["structural_scarcity"] = {
            "active": scarcity,
            "total_demand": total_demand,
            "inventory_lots": int(inventory),
            "fleet_capacity": fleet_capacity,
            "max_deliverable": deliverable,
            "min_unmet_lots": total_demand - deliverable,
        }
        if scarcity:
            issues.warn(
                "STRUCTURAL_SCARCITY",
                f"Escasez estructural: la demanda total ({total_demand} lotes) supera lo que se "
                f"puede entregar (inventario {int(inventory)}, capacidad de flota "
                f"{fleet_capacity}). "
                f"Quedarán sin cubrir al menos {total_demand - deliverable} lotes.",
                "inventory_lots",
            )
        summary.update(
            {
                "total_demand": total_demand,
                "weighted_demand": sum(
                    c["priority_weight"] * c["demand_lots"]
                    for c in centers
                    if c["priority_weight"] in (1, 2, 3)
                ),
                "inventory_lots": int(inventory),
                "fleet_capacity": fleet_capacity,
                "max_vehicle_capacity": max_capacity,
            }
        )

    non_synthetic = [c for c in centers if c.get("source") != "synthetic"]
    if (
        non_synthetic
        and any(c.get("priority_weight") in (2, 3) for c in non_synthetic)
        and not scenario["priority_criterion"]
    ):
        issues.warn(
            "PRIORITY_NEEDS_JUSTIFICATION",
            "Hay prioridades distintas de 1 en datos no sintéticos sin criterio documentado. "
            "Registre el criterio institucional auditable o use prioridad uniforme p = 1.",
            "priority_criterion",
        )
    inferred = [c["id"] for c in centers if c.get("demand_origin") == "inferred"]
    if inferred:
        issues.warn(
            "INFERRED_DEMAND",
            f"{len(inferred)} centro(s) tienen demanda inferida por regla declarada; no es una "
            "medición de necesidad.",
            "centers",
            centers=inferred,
        )

    valid = not issues.errors
    digest = None
    if valid:
        ids, matrix, _ = build_distance_matrix(scenario)
        digest = scenario_hash(scenario, ids, matrix)

    return {
        "valid": valid,
        "errors": issues.errors,
        "warnings": issues.warnings,
        "flags": flags,
        "summary": summary,
        "hash": digest,
        "normalized": scenario if valid else None,
    }
