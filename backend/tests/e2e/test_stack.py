"""Prueba extremo a extremo contra el stack Docker en ejecución.

Recorre por HTTP el flujo real (nginx → API → PostgreSQL → worker): cargar demo →
validar → guardar → línea base → cuatro corridas → exportar. Se omite si el stack no
responde en ``E2E_BASE_URL``.

Usa un escenario sintético propio (15 centros, semilla de fixture 987) y lo elimina
al terminar para no mezclar datos con la demo.
"""

from __future__ import annotations

import csv
import io
import os
import time

import httpx
import pytest

BASE_URL = os.environ.get("E2E_BASE_URL", "").rstrip("/")
pytestmark = pytest.mark.e2e


@pytest.fixture(scope="module")
def http():
    if not BASE_URL:
        pytest.skip("E2E_BASE_URL no definido")
    client = httpx.Client(base_url=BASE_URL, timeout=20.0)
    try:
        client.get("/health").raise_for_status()
    except httpx.HTTPError:
        client.close()
        pytest.skip(f"El stack no responde en {BASE_URL}")
    yield client
    client.close()


def wait_for(http, path: str, done, timeout: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = http.get(path).json()
        if done(body):
            return body
        time.sleep(0.4)
    raise AssertionError(f"Tiempo agotado esperando {path}")


def test_frontend_is_served_and_proxies_the_api(http) -> None:
    home = http.get("/")
    assert home.status_code == 200 and "NutriRuta" in home.text
    assert "text/html" in home.headers["content-type"]
    spa_route = http.get("/resultados")  # las rutas del cliente devuelven el index
    assert spa_route.status_code == 200 and "NutriRuta" in spa_route.text
    health = http.get("/health").json()
    assert health["status"] == "ok" and health["database"] == "ok"
    assert http.get("/api/v1/meta").json()["official_seeds"] == [11, 22, 33, 44]


def test_full_flow_with_real_worker_and_postgres(http) -> None:
    scenario = http.post(
        "/api/v1/scenarios/demo", json={"n_centers": 15, "fixture_seed": 987}
    ).json()
    scenario_id = scenario["scenario_id"]
    http.delete(f"/api/v1/scenarios/{scenario_id}")  # limpieza de un intento anterior
    try:
        report = http.post("/api/v1/scenarios/validate", json=scenario).json()
        assert report["valid"] is True
        created = http.post("/api/v1/scenarios", json=scenario)
        assert created.status_code == 201, created.text
        assert created.json()["hash"] == report["hash"]

        baseline = http.post("/api/v1/baselines", json={"scenario_id": scenario_id}).json()
        assert baseline["validation"]["feasible"] is True

        # corrida individual: el worker real la toma de la cola
        run_id = http.post("/api/v1/runs", json={"scenario_id": scenario_id, "seed": 11}).json()[
            "run_id"
        ]
        status = wait_for(
            http, f"/api/v1/runs/{run_id}", lambda b: b["status"] not in ("queued", "running")
        )
        assert status["status"] == "completed", status
        solution = http.get(f"/api/v1/runs/{run_id}/solution").json()
        assert solution["validation"]["feasible"] is True
        assert solution["baseline"]["d_ref_km"] == pytest.approx(baseline["d_ref_km"])

        # experimento oficial de cuatro corridas
        experiment_id = http.post(
            "/api/v1/experiments/four-runs", json={"scenario_id": scenario_id}
        ).json()["experiment_id"]
        experiment = wait_for(
            http, f"/api/v1/experiments/{experiment_id}", lambda b: b["status"] != "running"
        )
        assert experiment["status"] == "completed", experiment
        assert [row["seed"] for row in experiment["runs"]] == [11, 22, 33, 44]
        assert all(row["feasible"] for row in experiment["runs"])

        # reproducibilidad real: la corrida suelta con semilla 11 = la corrida 1 del experimento
        twin = http.get(f"/api/v1/runs/{experiment['runs'][0]['run_id']}/solution").json()
        assert twin["chromosome"] == solution["chromosome"]
        assert twin["metrics"]["J"] == solution["metrics"]["J"]

        exported = http.get(f"/api/v1/experiments/{experiment_id}/export", params={"format": "csv"})
        assert exported.status_code == 200
        rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
        assert [r["seed"] for r in rows if r["metodo"] == "AG"] == ["11", "22", "33", "44"]
    finally:
        assert http.delete(f"/api/v1/scenarios/{scenario_id}").status_code in (204, 404)
