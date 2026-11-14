"""Exportación de evidencias (CSV UTF-8 y JSON) con semillas, parámetros, versión y fecha.

Los CSV llevan los metadatos como columnas repetidas en cada fila para que cualquier
hoja de cálculo o ``pandas`` los lea sin tratamiento especial. Se emiten en UTF-8 con
BOM para que Excel muestre bien las tildes.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from typing import Any

DECLARATION = (
    "Herramienta académica de simulación orientada a apoyar el diseño de entregas; los "
    "resultados no equivalen a efectos medidos sobre inseguridad alimentaria."
)

EXPERIMENT_COLUMNS = [
    "metodo",
    "corrida",
    "seed",
    "estado",
    "J",
    "fitness",
    "U",
    "R",
    "H",
    "lotes_entregados",
    "lotes_demandados",
    "cobertura_ponderada",
    "distancia_km",
    "modalidad_distancia",
    "vehiculos_usados",
    "tiempo_cpu_s",
    "generaciones",
    "criterio_parada",
    "factible",
    "D_ref_km",
    "run_id",
    "experiment_id",
    "scenario_id",
    "scenario_hash",
    "origen_datos",
    "version_codigo",
    "fecha_ejecucion_utc",
    "parametros_json",
]

ASSIGNMENT_COLUMNS = [
    "center_id",
    "nombre",
    "prioridad",
    "demanda_lotes",
    "asignado_lotes",
    "pendiente_lotes",
    "vehiculo",
    "orden_parada",
    "solo_parcial",
    "run_id",
    "seed",
    "scenario_id",
    "scenario_hash",
    "version_codigo",
    "fecha_ejecucion_utc",
]


def _csv_bytes(columns: list[str], rows: list[dict[str, Any]]) -> bytes:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("" if v is None else v) for k, v in row.items()})
    return stream.getvalue().encode("utf-8-sig")


def _number(value: Any, digits: int = 6) -> Any:
    return round(value, digits) if isinstance(value, float) else value


def experiment_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Cuatro filas del AG (una por semilla) + una fila de la línea base, claramente rotulada."""
    common = {
        "experiment_id": payload["experiment_id"],
        "scenario_id": payload["scenario_id"],
        "scenario_hash": payload["scenario_hash"],
        "origen_datos": payload["data_origin"],
        "version_codigo": payload["code_version"],
        "D_ref_km": _number(payload["baseline"]["d_ref_km"]),
    }
    params = json.dumps(payload["parameters"], sort_keys=True, ensure_ascii=False)
    rows = []
    for run in payload["runs"]:
        m = run["metrics"] or {}
        rows.append(
            {
                **common,
                "metodo": "AG",
                "corrida": run["corrida"],
                "seed": run["seed"],
                "estado": run["status"],
                "J": _number(m.get("J")),
                "fitness": _number(m.get("fitness")),
                "U": _number(m.get("U")),
                "R": _number(m.get("R")),
                "H": _number(m.get("H")),
                "lotes_entregados": m.get("lots_delivered"),
                "lotes_demandados": m.get("lots_demanded"),
                "cobertura_ponderada": _number(m.get("weighted_coverage")),
                "distancia_km": _number(m.get("total_km"), 3),
                "modalidad_distancia": m.get("distance_mode"),
                "vehiculos_usados": m.get("vehicles_used"),
                "tiempo_cpu_s": _number(m.get("cpu_seconds"), 3),
                "generaciones": m.get("generations_run"),
                "criterio_parada": run["stop_reason"],
                "factible": {True: "sí", False: "no", None: ""}[run["feasible"]],
                "run_id": run["run_id"],
                "fecha_ejecucion_utc": run["ended_at"],
                "parametros_json": params,
            }
        )
    b = payload["baseline"]["metrics"]
    rows.append(
        {
            **common,
            "metodo": "linea_base",
            "corrida": "",
            "seed": "",
            "estado": "determinista",
            "J": _number(b["J"]),
            "fitness": _number(b["fitness"]),
            "U": _number(b["U"]),
            "R": _number(b["R"]),
            "H": _number(b["H"]),
            "lotes_entregados": b["lots_delivered"],
            "lotes_demandados": b["lots_demanded"],
            "cobertura_ponderada": _number(b["weighted_coverage"]),
            "distancia_km": _number(b["total_km"], 3),
            "modalidad_distancia": b["distance_mode"],
            "vehiculos_usados": b["vehicles_used"],
            "tiempo_cpu_s": "",
            "generaciones": "",
            "criterio_parada": "",
            "factible": "sí" if payload["baseline"]["feasible"] else "no",
            "run_id": "",
            "fecha_ejecucion_utc": "",
            "parametros_json": "",
        }
    )
    return rows


def experiment_csv(payload: dict[str, Any]) -> bytes:
    return _csv_bytes(EXPERIMENT_COLUMNS, experiment_rows(payload))


def export_envelope(kind: str, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "export": {
            "kind": kind,
            "exported_at_utc": datetime.now(UTC).isoformat(),
            "declaration": DECLARATION,
        },
        **body,
    }


def assignments_csv(solution: dict[str, Any], names: dict[str, str]) -> bytes:
    rows = [
        {
            "center_id": a["center_id"],
            "nombre": names.get(a["center_id"], ""),
            "prioridad": a["priority_weight"],
            "demanda_lotes": a["demand_lots"],
            "asignado_lotes": a["assigned_lots"],
            "pendiente_lotes": a["pending_lots"],
            "vehiculo": a["vehicle_id"],
            "orden_parada": a["stop_order"],
            "solo_parcial": "sí" if a["partial_only"] else "no",
            "run_id": solution["run_id"],
            "seed": solution["seed"],
            "scenario_id": solution["scenario_id"],
            "scenario_hash": solution["scenario_hash"],
            "version_codigo": solution["code_version"],
            "fecha_ejecucion_utc": solution["ended_at"],
        }
        for a in solution["assignments"]
    ]
    return _csv_bytes(ASSIGNMENT_COLUMNS, rows)
