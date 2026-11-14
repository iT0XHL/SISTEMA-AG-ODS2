"""Genera los fixtures versionados del proyecto (escenarios sintéticos e inválidos).

Uso (dentro de la imagen del backend):

    python /srv/scripts/create_demo.py --out /srv/fixtures

Todo lo generado es sintético y determinista (semilla de fixture fija). Los archivos
de ``invalid/`` existen para probar que el validador y el importador rechazan datos
defectuosos; el «padrón» con DNI/sexo/nombres es inventado y sirve para comprobar que
esas columnas se descartan.
"""

from __future__ import annotations

import argparse
import copy
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.data.demo import DEFAULT_FIXTURE_SEED, generate_demo_scenario
from app.domain.models import build_distance_matrix


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[list[object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle, lineterminator="\n").writerows(rows)


def small_scenario() -> dict:
    scenario = generate_demo_scenario(
        n_centers=6,
        fixture_seed=DEFAULT_FIXTURE_SEED,
        inventory_lots=40,
        n_vehicles=2,
        vehicle_capacity=25,
    )
    scenario["scenario_id"] = "synthetic-small-6"
    scenario["label"] = "Fixture sintético pequeño (6 centros)"
    return scenario


def medium_scenario() -> dict:
    scenario = generate_demo_scenario(n_centers=20, fixture_seed=DEFAULT_FIXTURE_SEED)
    scenario["scenario_id"] = "synthetic-medium-20"
    scenario["label"] = "Fixture sintético mediano (20 centros)"
    return scenario


def road_variant(base: dict) -> tuple[dict, list[list[object]]]:
    """Mismo escenario pequeño, pero con matriz «vial» ficticia y asimétrica (para pruebas)."""
    scenario = copy.deepcopy(base)
    ids, matrix, _ = build_distance_matrix(scenario)
    rows: list[list[object]] = [["from_id", "to_id", "km"]]
    entries = []
    for i, a in enumerate(ids):
        for j, b in enumerate(ids):
            if i == j:
                continue
            # factor de desvío ficticio 1.30, +4 % en un sentido para que sea asimétrica
            km = round(matrix[i][j] * 1.30 * (1.04 if i < j else 1.0), 3)
            rows.append([a, b, km])
            entries.append({"from_id": a, "to_id": b, "km": km})
    scenario.update(
        {
            "scenario_id": "synthetic-small-6-road",
            "label": "Fixture sintético pequeño con matriz vial ficticia",
            "distance_mode": "road_matrix",
            "distance_source": "road_csv_ficticio",
            "distances": entries,
        }
    )
    return scenario, rows


def invalid_fixtures(base: dict) -> dict[str, dict]:
    def variant(mutator) -> dict:
        scenario = copy.deepcopy(base)
        scenario["scenario_id"] = None
        mutator(scenario)
        return scenario

    def duplicate_ids(s: dict) -> None:
        s["centers"][1]["id"] = s["centers"][0]["id"]

    def negative_capacity(s: dict) -> None:
        s["vehicles"][0]["capacity_lots"] = -10

    def zero_capacity(s: dict) -> None:
        s["vehicles"][0]["capacity_lots"] = 0

    def bad_coordinates(s: dict) -> None:
        s["centers"][0]["lat"] = -113.07
        s["centers"][1]["lon"] = 276.39

    def zero_inventory(s: dict) -> None:
        s["inventory_lots"] = 0

    def no_centers(s: dict) -> None:
        s["centers"] = []

    def no_vehicles(s: dict) -> None:
        s["vehicles"] = []

    def missing_demand(s: dict) -> None:
        s["centers"][2]["demand_lots"] = None

    def negative_demand(s: dict) -> None:
        s["centers"][2]["demand_lots"] = -4

    def bad_priority(s: dict) -> None:
        s["centers"][3]["priority_weight"] = 5

    def all_zero_demand(s: dict) -> None:
        for center in s["centers"]:
            center["demand_lots"] = 0

    def mixed_distances(s: dict) -> None:
        s["distances"] = [{"from_id": "DEPOT", "to_id": "C01", "km": 3.2}]

    return {
        "duplicate_center_ids": variant(duplicate_ids),
        "negative_capacity": variant(negative_capacity),
        "zero_capacity": variant(zero_capacity),
        "coordinates_out_of_range": variant(bad_coordinates),
        "zero_inventory": variant(zero_inventory),
        "no_centers": variant(no_centers),
        "no_vehicles": variant(no_vehicles),
        "missing_demand": variant(missing_demand),
        "negative_demand": variant(negative_demand),
        "priority_out_of_range": variant(bad_priority),
        "all_zero_demand": variant(all_zero_demand),
        "haversine_with_matrix": variant(mixed_distances),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "fixtures"))
    out = Path(parser.parse_args().out)

    small = small_scenario()
    write_json(out / "synthetic_small" / "scenario.json", small)
    road, matrix_rows = road_variant(small)
    write_json(out / "synthetic_small" / "scenario_road.json", road)
    write_csv(out / "synthetic_small" / "matrix_road_long.csv", matrix_rows)

    write_json(out / "synthetic_medium" / "scenario.json", medium_scenario())
    write_json(out / "demo" / "scenario.json", generate_demo_scenario())

    for name, scenario in invalid_fixtures(small).items():
        write_json(out / "invalid" / f"{name}.json", scenario)

    # Matrices defectuosas
    write_csv(
        out / "invalid" / "matrix_not_square.csv",
        [["", "DEPOT", "C01", "C02"], ["DEPOT", 0, 2.5, 3.1], ["C01", 2.5, 0, 1.2]],
    )
    write_csv(
        out / "invalid" / "matrix_negative.csv",
        [["from_id", "to_id", "km"], ["DEPOT", "C01", -2.5], ["C01", "DEPOT", 2.5]],
    )
    write_csv(
        out / "invalid" / "matrix_nan_inf.csv",
        [["from_id", "to_id", "km"], ["DEPOT", "C01", "NaN"], ["C01", "DEPOT", "Inf"]],
    )
    write_csv(
        out / "invalid" / "matrix_incomplete.csv",
        [["from_id", "to_id", "km"], ["DEPOT", "C01", 2.5], ["C01", "DEPOT", 2.5]],
    )

    # Padrón inventado con columnas personales: sirve para probar que se descartan.
    write_csv(
        out / "invalid" / "padron_con_pii_ficticio.csv",
        [
            [
                "CODIGO",
                "NOMBRE_COMEDOR",
                "DISTRITO",
                "DIRECCION",
                "ESTADO",
                "NRO_USUARIOS",
                "DNI",
                "NOMBRES_APELLIDOS",
                "SEXO",
                "TELEFONO",
            ],
            [
                "CP-001",
                "COMEDOR FICTICIO LOS OLIVOS",
                "ZONA FICTICIA A",
                "CALLE INVENTADA 123",
                "ACTIVO",
                85,
                "ZZ000001",
                "PERSONA FICTICIA UNO",
                "F",
                "TEL-FICT-001",
            ],
            [
                "CP-002",
                "OLLA COMUN FICTICIA LA ESPERANZA",
                "ZONA FICTICIA B",
                "PASAJE INVENTADO S/N",
                "ACTIVO",
                60,
                "ZZ000002",
                "PERSONA FICTICIA DOS",
                "F",
                "TEL-FICT-002",
            ],
            [
                "CP-003",
                "COMEDOR FICTICIO SAN ISIDRO",
                "ZONA FICTICIA A",
                "AV. INVENTADA 456",
                "INACTIVO",
                40,
                "ZZ000003",
                "PERSONA FICTICIA TRES",
                "M",
                "TEL-FICT-003",
            ],
            [
                "CP-002",
                "OLLA COMUN FICTICIA DUPLICADA",
                "ZONA FICTICIA B",
                "PASAJE INVENTADO S/N",
                "ACTIVO",
                55,
                "ZZ000004",
                "PERSONA FICTICIA CUATRO",
                "F",
                "TEL-FICT-004",
            ],
            [
                "CP-004",
                "COMEDOR FICTICIO VIRGEN DEL CARMEN",
                "ZONA FICTICIA C",
                "JR. INVENTADO 789",
                "ACTIVO",
                120,
                "ZZ000005",
                "PERSONA FICTICIA CINCO",
                "F",
                "TEL-FICT-005",
            ],
            [
                "CP-005",
                "OLLA COMUN FICTICIA NUEVO AMANECER",
                "ZONA FICTICIA C",
                "MZ. Z LT. 1",
                "ACTIVO",
                72,
                "ZZ000006",
                "PERSONA FICTICIA SEIS",
                "M",
                "TEL-FICT-006",
            ],
            [
                "CP-006",
                "",
                "ZONA FICTICIA A",
                "SIN NOMBRE",
                "ACTIVO",
                30,
                "ZZ000007",
                "PERSONA FICTICIA SIETE",
                "F",
                "TEL-FICT-007",
            ],
            [
                "CP-007",
                "COMEDOR FICTICIO SANTA ROSA",
                "ZONA FICTICIA B",
                "CALLE INVENTADA 321",
                "ACTIVO",
                95,
                "ZZ000008",
                "PERSONA FICTICIA OCHO",
                "F",
                "TEL-FICT-008",
            ],
        ],
    )
    (out / "invalid" / "corrupt.csv").write_bytes(
        b"\xff\xfe\x00\x00\x9d\x00CODIGO;;;\n\x00\x81\x8d"
    )
    (out / "invalid" / "corrupt.xlsx").write_bytes(b"esto no es un archivo de Excel")
    print(f"Fixtures escritos en {out}")


if __name__ == "__main__":
    main()
