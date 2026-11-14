"""Pruebas de integración de la API sobre SQLite (flujo completo, errores y seguridad)."""

from __future__ import annotations

import csv
import io
import json

import pytest
from sqlalchemy import inspect, text

from app.storage import repository as repo
from app.storage.db import get_engine, session_scope
from tests.conftest import FIXTURES, drain_queue, load_fixture

API = "/api/v1"
PII_TOKENS = ("ZZ000001", "ZZ000005", "PERSONA FICTICIA", "Persona Ficticia", "TEL-FICT-001")
FORBIDDEN_NAMES = ("dni", "sexo", "nombres_apellidos", "persona", "beneficiari", "telefono")


def create_demo(api) -> dict:
    scenario = api.post(f"{API}/scenarios/demo").json()
    response = api.post(f"{API}/scenarios", json=scenario)
    assert response.status_code in (200, 201), response.text
    return response.json()


def assert_error_shape(body: dict) -> None:
    assert set(body) == {"code", "message", "field", "details"}
    assert body["code"] and body["message"]


# ----------------------------------------------------------------- estado y metadatos
def test_health_and_meta(api) -> None:
    health = api.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok" and health.json()["database"] == "ok"
    meta = api.get(f"{API}/meta").json()
    assert meta["official_seeds"] == [11, 22, 33, 44]
    assert meta["docente_preset"]["population_size"] == 100
    assert meta["limits"]["max_centers"] == 50
    assert "inseguridad alimentaria" in meta["declaration"]


# ------------------------------------------------------------------------- escenarios
def test_demo_scenario_flow_create_read_idempotent_and_conflict(api) -> None:
    scenario = api.post(f"{API}/scenarios/demo").json()
    assert scenario["data_origin"] == "synthetic" and len(scenario["centers"]) == 18
    assert scenario["fixture_seed"] == 2026

    report = api.post(f"{API}/scenarios/validate", json=scenario).json()
    assert report["valid"] is True and report["errors"] == []
    assert report["flags"]["structural_scarcity"]["active"] is True
    assert api.get(f"{API}/scenarios").json() == []  # validar no guarda

    created = api.post(f"{API}/scenarios", json=scenario)
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == "demo-cañete-001" and len(body["hash"]) == 64
    assert body["hash"] == report["hash"]
    assert body["provenance"]["badge"] == "Simulación"
    assert body["provenance"]["centers_by_source"] == {"synthetic": 18}

    again = api.post(f"{API}/scenarios", json=scenario)
    assert again.status_code == 200 and again.json()["created"] is False

    changed = {**scenario, "inventory_lots": 100}
    conflict = api.post(f"{API}/scenarios", json=changed)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "SCENARIO_ID_CONFLICT"
    assert_error_shape(conflict.json())

    read = api.get(f"{API}/scenarios/demo-cañete-001").json()
    assert read["n_centers"] == 18 and read["scenario"]["centers"][0]["source"] == "synthetic"
    matrix = api.get(f"{API}/scenarios/demo-cañete-001/matrix").json()
    assert len(matrix["ids"]) == 19 and matrix["ids"][0] == "DEPOT" and matrix["unit"] == "km"
    assert all(matrix["matrix_km"][i][i] == 0 for i in range(19))


def test_demo_request_limits(api) -> None:
    assert len(api.post(f"{API}/scenarios/demo", json={"n_centers": 15}).json()["centers"]) == 15
    out_of_range = api.post(f"{API}/scenarios/demo", json={"n_centers": 40})
    assert out_of_range.status_code == 422 and out_of_range.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    ("fixture", "code"),
    [
        ("negative_capacity", "INVALID_CAPACITY"),
        ("coordinates_out_of_range", "INVALID_LATITUDE"),
        ("zero_inventory", "EMPTY_INVENTORY"),
        ("no_vehicles", "NO_VEHICLES"),
        ("missing_demand", "MISSING_DEMAND"),
        ("duplicate_center_ids", "DUPLICATE_CENTER_ID"),
    ],
)
def test_invalid_scenarios_are_reported_and_never_saved(api, fixture: str, code: str) -> None:
    scenario = load_fixture(f"invalid/{fixture}.json")
    report = api.post(f"{API}/scenarios/validate", json=scenario)
    assert report.status_code == 200
    assert report.json()["valid"] is False
    assert code in {e["code"] for e in report.json()["errors"]}

    rejected = api.post(f"{API}/scenarios", json=scenario)
    assert rejected.status_code == 422
    body = rejected.json()
    assert_error_shape(body)
    assert body["code"] == "SCENARIO_INVALID"
    assert code in {e["code"] for e in body["details"]["errors"]}
    assert api.get(f"{API}/scenarios").json() == []


def test_incomplete_road_matrix_blocks_the_scenario(api) -> None:
    road = load_fixture("synthetic_small/scenario_road.json")
    road["distances"] = road["distances"][:-3]
    rejected = api.post(f"{API}/scenarios", json=road)
    assert rejected.status_code == 422
    assert "MATRIX_INCOMPLETE" in {e["code"] for e in rejected.json()["details"]["errors"]}


def test_schema_errors_are_structured_and_personal_fields_are_refused(api) -> None:
    scenario = api.post(f"{API}/scenarios/demo").json()
    scenario["centers"][0]["dni"] = "00000001"
    refused = api.post(f"{API}/scenarios", json=scenario)
    assert refused.status_code == 422
    body = refused.json()
    assert_error_shape(body)
    assert body["code"] == "VALIDATION_ERROR" and "dni" in body["field"]
    assert "datos personales" in body["message"]
    assert "00000001" not in json.dumps(body["message"])

    wrong_type = api.post(f"{API}/scenarios/validate", json={"centers": "no-es-lista"})
    assert wrong_type.status_code == 422 and wrong_type.json()["field"] == "centers"

    missing = api.get(f"{API}/scenarios/no-existe")
    assert missing.status_code == 404
    assert_error_shape(missing.json())
    assert missing.json()["code"] == "SCENARIO_NOT_FOUND"
    assert api.get("/ruta/inexistente").json()["code"] == "NOT_FOUND"


# -------------------------------------------------------------- línea base y corridas
def test_baseline_endpoint(api) -> None:
    scenario_id = create_demo(api)["id"]
    baseline = api.post(f"{API}/baselines", json={"scenario_id": scenario_id})
    assert baseline.status_code == 200
    body = baseline.json()
    assert body["validation"]["feasible"] is True
    assert body["metrics"]["R"] == pytest.approx(1.0)
    assert body["d_ref_km"] == pytest.approx(body["metrics"]["total_km"])
    assert body["metrics"]["lots_delivered"] <= 135
    assert api.post(f"{API}/baselines", json={"scenario_id": "x"}).status_code == 404


def test_run_lifecycle_solution_history_and_exports(api) -> None:
    scenario_id = create_demo(api)["id"]
    started = api.post(f"{API}/runs", json={"scenario_id": scenario_id, "seed": 11})
    assert started.status_code == 202
    run_id = started.json()["run_id"]
    assert started.json()["status"] == "queued"

    not_ready = api.get(f"{API}/runs/{run_id}/solution")
    assert not_ready.status_code == 409 and not_ready.json()["code"] == "RUN_NOT_COMPLETED"

    assert drain_queue() == [run_id]
    status = api.get(f"{API}/runs/{run_id}").json()
    assert status["status"] == "completed" and status["error"] is None
    assert status["progress"]["fraction"] == 1.0
    assert status["stop_reason"] in ("stagnation", "max_generations")
    assert status["code_version"] and len(status["scenario_hash"]) == 64

    solution = api.get(f"{API}/runs/{run_id}/solution").json()
    assert solution["label"] == "Mejor solución encontrada en esta corrida"
    assert solution["validation"]["feasible"] is True
    assert all(check["ok"] for check in solution["validation"]["checks"])
    metrics = solution["metrics"]
    assert metrics["lots_delivered"] <= 135
    assert metrics["fitness"] == pytest.approx(1 / (1 + metrics["J"]))
    assert metrics["J"] == pytest.approx(
        0.75 * metrics["U"] + 0.20 * metrics["R"] + 0.05 * metrics["H"]
    )
    # rutas sin duplicados y con depósito en ambos extremos
    visited = [stop["center_id"] for route in solution["routes"] for stop in route["stops"]]
    assert len(visited) == len(set(visited))
    for route in solution["routes"]:
        assert route["load_lots"] <= route["capacity_lots"]
        if route["used"]:
            assert route["path"][0] == route["path"][-1] == "DEPOT"
    assert sorted(solution["chromosome"]["pi"]) == sorted(solution["chromosome"]["q"])
    # misma instancia y misma D_ref para AG y línea base
    assert solution["baseline"]["d_ref_km"] == metrics["d_ref_km"]
    assert solution["baseline"]["metrics"]["distance_mode"] == metrics["distance_mode"]
    assert solution["comparison"]["same_instance"] is True

    history = api.get(f"{API}/runs/{run_id}/history").json()["generations"]
    assert [g["number"] for g in history] == list(range(metrics["generations_run"] + 1))
    assert history[-1]["best_fitness"] == pytest.approx(metrics["fitness"])
    tail = api.get(f"{API}/runs/{run_id}/history", params={"since": 5}).json()["generations"]
    assert tail[0]["number"] == 5

    exported = api.get(f"{API}/runs/{run_id}/export", params={"format": "json"})
    assert exported.status_code == 200
    evidence = exported.json()
    assert evidence["solution"]["seed"] == 11 and evidence["export"]["exported_at_utc"]
    assert evidence["solution"]["parameters"]["population_size"] == 100
    assert evidence["solution"]["code_version"] and len(evidence["history"]) == len(history)

    table = api.get(f"{API}/runs/{run_id}/export", params={"format": "csv"})
    assert table.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(table.content.decode("utf-8-sig"))))
    assert len(rows) == 18 and rows[0]["seed"] == "11" and rows[0]["scenario_hash"]
    assert sum(int(r["asignado_lotes"]) for r in rows) == metrics["lots_delivered"]


def test_same_seed_is_reproducible_through_the_api(api) -> None:
    scenario_id = create_demo(api)["id"]
    params = {"population_size": 40, "max_generations": 30}
    ids = [
        api.post(
            f"{API}/runs", json={"scenario_id": scenario_id, "seed": 22, "parameters": params}
        ).json()["run_id"]
        for _ in range(2)
    ]
    drain_queue()
    first, second = (api.get(f"{API}/runs/{i}/solution").json() for i in ids)
    assert first["chromosome"] == second["chromosome"]
    assert first["metrics"]["J"] == second["metrics"]["J"]
    h1, h2 = (api.get(f"{API}/runs/{i}/history").json()["generations"] for i in ids)
    assert h1 == h2


def test_run_parameter_validation_and_missing_scenario(api) -> None:
    scenario_id = create_demo(api)["id"]
    too_many = api.post(
        f"{API}/runs", json={"scenario_id": scenario_id, "parameters": {"max_generations": 5000}}
    )
    assert too_many.status_code == 422 and too_many.json()["code"] == "TOO_MANY_GENERATIONS"
    bad_weights = api.post(
        f"{API}/runs", json={"scenario_id": scenario_id, "parameters": {"w_u": 0.9}}
    )
    assert bad_weights.status_code == 422 and bad_weights.json()["code"] == "INVALID_PARAMETERS"
    out_of_range = api.post(
        f"{API}/runs", json={"scenario_id": scenario_id, "parameters": {"crossover_prob": 2}}
    )
    assert out_of_range.status_code == 422 and out_of_range.json()["code"] == "VALIDATION_ERROR"
    assert api.post(f"{API}/runs", json={"scenario_id": "nada"}).status_code == 404
    assert api.get(f"{API}/runs/no-existe").json()["code"] == "RUN_NOT_FOUND"


def test_cancel_queued_run(api) -> None:
    scenario_id = create_demo(api)["id"]
    run_id = api.post(f"{API}/runs", json={"scenario_id": scenario_id}).json()["run_id"]
    cancelled = api.post(f"{API}/runs/{run_id}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["cancel_requested"] is True
    drain_queue()
    status = api.get(f"{API}/runs/{run_id}").json()
    assert status["status"] == "cancelled"
    assert api.get(f"{API}/runs/{run_id}/solution").status_code == 409
    again = api.post(f"{API}/runs/{run_id}/cancel")
    assert again.status_code == 409 and again.json()["code"] == "RUN_ALREADY_FINISHED"


def test_cancel_while_running_stops_at_generation_boundary(api, monkeypatch) -> None:
    from app.services import run_service

    scenario_id = create_demo(api)["id"]
    run_id = api.post(
        f"{API}/runs",
        json={"scenario_id": scenario_id, "parameters": {"stagnation_generations": 1000}},
    ).json()["run_id"]
    monkeypatch.setattr(run_service, "FLUSH_EVERY_GENERATIONS", 1)
    original = repo.add_generations

    def add_and_request_cancel(session, rid, records):
        original(session, rid, records)
        if records[-1].number >= 3:
            repo.get_run(session, rid).cancel_requested = True

    monkeypatch.setattr(repo, "add_generations", add_and_request_cancel)
    drain_queue()
    status = api.get(f"{API}/runs/{run_id}").json()
    assert status["status"] == "cancelled" and status["stop_reason"] == "cancelled"
    assert 3 <= status["progress"]["generation"] < 200


def test_time_limit_marks_the_run_as_failed_with_legible_error(api, monkeypatch) -> None:
    from app.config import get_settings

    scenario_id = create_demo(api)["id"]
    run_id = api.post(f"{API}/runs", json={"scenario_id": scenario_id}).json()["run_id"]
    monkeypatch.setattr(get_settings(), "max_run_seconds", 0.0)
    drain_queue()
    status = api.get(f"{API}/runs/{run_id}").json()
    assert status["status"] == "failed" and status["error"]["code"] == "TIME_LIMIT"
    assert "tiempo máximo" in status["error"]["message"]


# -------------------------------------------------------------------- cuatro corridas
def test_four_runs_experiment_and_export(api) -> None:
    scenario_id = create_demo(api)["id"]
    started = api.post(f"{API}/experiments/four-runs", json={"scenario_id": scenario_id})
    assert started.status_code == 202
    body = started.json()
    assert body["seeds"] == [11, 22, 33, 44]
    assert [run["seed"] for run in body["runs"]] == [11, 22, 33, 44]
    experiment_id = body["experiment_id"]

    pending = api.get(f"{API}/experiments/{experiment_id}/export")
    assert pending.status_code == 409 and pending.json()["code"] == "EXPERIMENT_NOT_COMPLETED"

    processed = drain_queue()
    assert processed == [run["run_id"] for run in body["runs"]]  # FIFO: 11, 22, 33, 44

    experiment = api.get(f"{API}/experiments/{experiment_id}").json()
    assert experiment["status"] == "completed" and len(experiment["runs"]) == 4
    assert [row["seed"] for row in experiment["runs"]] == [11, 22, 33, 44]
    assert [row["corrida"] for row in experiment["runs"]] == [1, 2, 3, 4]
    assert all(row["feasible"] is True for row in experiment["runs"])
    assert experiment["summary"]["all_feasible"] is True
    # mismos parámetros, mismo escenario (hash) y misma D_ref en las cuatro
    hashes, params, d_refs = set(), [], set()
    for row in experiment["runs"]:
        run = api.get(f"{API}/runs/{row['run_id']}").json()
        solution = api.get(f"{API}/runs/{row['run_id']}/solution").json()
        hashes.add(run["scenario_hash"])
        params.append(run["parameters"])
        d_refs.add(solution["metrics"]["d_ref_km"])
    assert len(hashes) == 1 and len(d_refs) == 1
    assert all(p == experiment["parameters"] for p in params)
    assert d_refs == {experiment["baseline"]["d_ref_km"]}
    js = [row["metrics"]["J"] for row in experiment["runs"]]
    assert experiment["summary"]["J"]["mean"] == pytest.approx(sum(js) / 4)
    assert experiment["summary"]["J"]["std"] >= 0

    exported = api.get(f"{API}/experiments/{experiment_id}/export", params={"format": "csv"})
    assert exported.status_code == 200
    assert "attachment" in exported.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
    ga_rows = [r for r in rows if r["metodo"] == "AG"]
    assert [r["seed"] for r in ga_rows] == ["11", "22", "33", "44"]  # exactamente cuatro
    assert [r["metodo"] for r in rows].count("linea_base") == 1 and len(rows) == 5
    for r in ga_rows:
        assert r["factible"] == "sí" and r["version_codigo"] and r["fecha_ejecucion_utc"]
        assert json.loads(r["parametros_json"])["population_size"] == 100
        assert r["modalidad_distancia"] == "haversine_demo" and len(r["scenario_hash"]) == 64
    assert float(ga_rows[0]["J"]) == pytest.approx(js[0], abs=1e-6)

    full = api.get(f"{API}/experiments/{experiment_id}/export", params={"format": "json"}).json()
    assert set(full["histories_by_seed"]) == {"11", "22", "33", "44"}
    assert set(full["solutions_by_seed"]) == {"11", "22", "33", "44"}
    assert full["export"]["declaration"]
    listing = api.get(f"{API}/experiments", params={"scenario_id": scenario_id}).json()
    assert listing[0]["experiment_id"] == experiment_id
    assert api.get(f"{API}/experiments/nada").status_code == 404


def test_road_matrix_scenario_runs_end_to_end(api) -> None:
    road = load_fixture("synthetic_small/scenario_road.json")
    created = api.post(f"{API}/scenarios", json=road)
    assert created.status_code == 201, created.text
    run_id = api.post(
        f"{API}/runs",
        json={"scenario_id": created.json()["id"], "parameters": {"max_generations": 30}},
    ).json()["run_id"]
    drain_queue()
    solution = api.get(f"{API}/runs/{run_id}/solution").json()
    assert solution["validation"]["feasible"] is True
    assert solution["metrics"]["distance_mode"] == "road_matrix"
    assert "viales" in solution["metrics"]["distance_mode_label"]


def test_delete_scenario_cascades(api) -> None:
    scenario_id = create_demo(api)["id"]
    api.post(f"{API}/experiments/four-runs", json={"scenario_id": scenario_id})
    api.post(f"{API}/runs", json={"scenario_id": scenario_id})
    assert api.delete(f"{API}/scenarios/{scenario_id}").status_code == 204
    assert api.get(f"{API}/scenarios").json() == []
    assert api.get(f"{API}/runs").json() == []
    assert drain_queue() == []


# ------------------------------------------------------------- importación y privacidad
def padron_file() -> dict:
    content = (FIXTURES / "invalid" / "padron_con_pii_ficticio.csv").read_bytes()
    return {"file": ("padron.csv", content, "text/csv")}


def test_padron_preview_and_normalize_endpoints(api) -> None:
    preview = api.post(f"{API}/imports/padron/preview", files=padron_file())
    assert preview.status_code == 200
    columns = {c["name"]: c for c in preview.json()["columns"]}
    assert columns["DNI"]["pii"] and columns["SEXO"]["pii"] and columns["NOMBRES_APELLIDOS"]["pii"]
    assert not any(token in preview.text for token in PII_TOKENS)

    mapping = {c["suggested_field"]: c["name"] for c in columns.values() if c["suggested_field"]}
    assert mapping["name"] == "NOMBRE_COMEDOR" and "DNI" not in mapping.values()
    normalized = api.post(
        f"{API}/imports/padron/normalize",
        files=padron_file(),
        data={
            "mapping": json.dumps(mapping),
            "demand_rule": json.dumps({"rations_per_user": 1, "rations_per_lot": 10}),
        },
    )
    assert normalized.status_code == 200, normalized.text
    body = normalized.json()
    assert body["report"]["accepted"] == 5
    assert set(body["report"]["pii_removed"]) == {"DNI", "NOMBRES_APELLIDOS", "SEXO", "TELEFONO"}
    assert not any(token in normalized.text for token in PII_TOKENS)

    refused = api.post(
        f"{API}/imports/padron/normalize",
        files=padron_file(),
        data={"mapping": json.dumps({**mapping, "district": "DNI"})},
    )
    assert refused.status_code == 422 and refused.json()["code"] == "PII_COLUMN_NOT_ALLOWED"


def test_upload_errors(api) -> None:
    corrupt = api.post(
        f"{API}/imports/padron/preview",
        files={"file": ("x.xlsx", b"no es excel", "application/octet-stream")},
    )
    assert corrupt.status_code == 422 and corrupt.json()["code"] == "CORRUPT_FILE"
    big = api.post(
        f"{API}/imports/padron/preview",
        files={"file": ("big.csv", b"A,B\n" + b"1,2\n" * 400_000, "text/csv")},
    )
    assert big.status_code == 413
    assert big.json()["code"] in ("PAYLOAD_TOO_LARGE", "FILE_TOO_LARGE")
    bad_matrix = api.post(
        f"{API}/imports/matrix",
        files={
            "file": (
                "m.csv",
                (FIXTURES / "invalid" / "matrix_not_square.csv").read_bytes(),
                "text/csv",
            )
        },
    )
    assert bad_matrix.status_code == 422 and bad_matrix.json()["code"] == "MATRIX_NOT_SQUARE"
    good_matrix = api.post(
        f"{API}/imports/matrix",
        files={
            "file": (
                "m.csv",
                (FIXTURES / "synthetic_small" / "matrix_road_long.csv").read_bytes(),
                "text/csv",
            )
        },
    )
    assert good_matrix.status_code == 200 and good_matrix.json()["count"] == 42
    bad_mapping = api.post(
        f"{API}/imports/padron/normalize", files=padron_file(), data={"mapping": "{no-json"}
    )
    assert bad_mapping.status_code == 422 and bad_mapping.json()["code"] == "INVALID_JSON"


def test_personal_data_never_reaches_database_or_exports(api) -> None:
    """Plan §9.1-9: DNI, sexo y nombres_apellidos nunca quedan en la BD ni en los exports."""
    preview = api.post(f"{API}/imports/padron/preview", files=padron_file()).json()
    mapping = {c["suggested_field"]: c["name"] for c in preview["columns"] if c["suggested_field"]}
    centers = api.post(
        f"{API}/imports/padron/normalize",
        files=padron_file(),
        data={
            "mapping": json.dumps(mapping),
            "demand_rule": json.dumps({"rations_per_user": 1, "rations_per_lot": 10}),
        },
    ).json()["centers"]

    # El usuario completa lo que el padrón no trae: coordenadas declaradas, flota, inventario.
    for k, center in enumerate(centers):
        center["lat"], center["lon"] = -13.05 - 0.01 * k, -76.35 + 0.01 * k
    scenario = {
        "scenario_id": "padron-ficticio-prueba",
        "label": "Padrón ficticio importado",
        "data_origin": "mixed",
        "distance_mode": "haversine_demo",
        "depot": {"id": "DEPOT", "lat": -13.07, "lon": -76.39},
        "inventory_lots": 30,
        "vehicles": [{"id": "V01", "capacity_lots": 20}, {"id": "V02", "capacity_lots": 20}],
        "centers": centers,
    }
    created = api.post(f"{API}/scenarios", json=scenario)
    assert created.status_code == 201, created.text
    assert created.json()["provenance"]["centers_by_demand_origin"] == {"inferred": 5}
    assert "INFERRED_DEMAND" in {w["code"] for w in created.json()["warnings"]}
    experiment_id = api.post(
        f"{API}/experiments/four-runs", json={"scenario_id": "padron-ficticio-prueba"}
    ).json()["experiment_id"]
    drain_queue()

    # 1) el esquema no tiene tablas ni columnas de datos personales
    inspector = inspect(get_engine())
    tables = inspector.get_table_names()
    assert sorted(tables) == [
        "center",
        "distance",
        "experiment",
        "generation",
        "run",
        "scenario",
        "solution",
        "vehicle",
    ]
    for table in tables:
        names = [table] + [column["name"] for column in inspector.get_columns(table)]
        for name in names:
            assert not any(bad in name.lower() for bad in FORBIDDEN_NAMES), name

    # 2) ningún valor personal en ninguna fila de ninguna tabla
    with session_scope() as session:
        for table in tables:
            for row in session.execute(text(f'SELECT * FROM "{table}"')):
                blob = " ".join(str(value) for value in row)
                assert not any(token in blob for token in PII_TOKENS), table

    # 3) ni en las respuestas ni en los exports
    outputs = [
        api.get(f"{API}/scenarios/padron-ficticio-prueba").text,
        api.get(f"{API}/experiments/{experiment_id}").text,
        api.get(f"{API}/experiments/{experiment_id}/export", params={"format": "json"}).text,
        api.get(f"{API}/experiments/{experiment_id}/export", params={"format": "csv"}).text,
    ]
    for run in api.get(f"{API}/experiments/{experiment_id}").json()["runs"]:
        outputs.append(
            api.get(f"{API}/runs/{run['run_id']}/export", params={"format": "json"}).text
        )
        outputs.append(api.get(f"{API}/runs/{run['run_id']}/export", params={"format": "csv"}).text)
    for output in outputs:
        assert not any(token in output for token in PII_TOKENS)
        lowered = output.lower()
        assert '"dni"' not in lowered and '"sexo"' not in lowered
        assert "nombres_apellidos" not in lowered
