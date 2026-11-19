"""Fixtures compartidos por las pruebas."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.data.demo import generate_demo_scenario
from app.domain.models import Problem, build_problem
from app.domain.validators import validate_scenario


def _fixtures_dir() -> Path:
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / "fixtures", Path("/srv/fixtures")):
        if (candidate / "demo" / "scenario.json").exists():
            return candidate
    raise RuntimeError("No se encontró la carpeta fixtures/ (ejecute scripts/create_demo.py)")


FIXTURES = _fixtures_dir()


def load_fixture(relative: str) -> dict:
    return json.loads((FIXTURES / relative).read_text(encoding="utf-8"))


def make_problem(
    demand: list[int],
    priority: list[int],
    capacities: list[int],
    inventory: int,
    dist: list[list[float]],
) -> Problem:
    n, m = len(demand), len(capacities)
    return Problem(
        center_ids=tuple(f"C{i + 1}" for i in range(n)),
        demand=tuple(demand),
        priority=tuple(priority),
        vehicle_ids=tuple(f"V{v + 1}" for v in range(m)),
        capacities=tuple(capacities),
        inventory=inventory,
        depot_id="DEPOT",
        dist=tuple(tuple(float(x) for x in row) for row in dist),
        distance_mode="road_matrix",
    )


@pytest.fixture
def hand_problem() -> Problem:
    """Fixture de 3 centros y 2 vehículos calculable a mano (ver test_fitness.py).

    Nodos: 0 = depósito, 1 = C1, 2 = C2, 3 = C3.
    """
    dist = [
        [0, 3, 4, 5],
        [3, 0, 2, 6],
        [4, 2, 0, 3],
        [5, 6, 3, 0],
    ]
    return make_problem(
        demand=[10, 8, 6], priority=[3, 1, 2], capacities=[10, 10], inventory=18, dist=dist
    )


@pytest.fixture(scope="session")
def demo_scenario() -> dict:
    return generate_demo_scenario()


@pytest.fixture(scope="session")
def demo_problem(demo_scenario: dict) -> Problem:
    report = validate_scenario(demo_scenario)
    assert report["valid"], report["errors"]
    return build_problem(report["normalized"])


@pytest.fixture
def small_scenario() -> dict:
    return load_fixture("synthetic_small/scenario.json")


ADMIN = {"username": "admin", "password": "NutriRuta2026!"}


def _client(tmp_path, monkeypatch, *, login: bool, rate_limit: dict[str, str] | None = None):
    """Cliente de la API sobre una base SQLite temporal, con o sin sesión iniciada."""
    from fastapi.testclient import TestClient

    from app import auth
    from app.config import get_settings
    from app.storage import db

    monkeypatch.setenv("DB_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    for name, value in (rate_limit or {}).items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    db.reset_engine()
    auth.throttle.reset()

    from app.main import create_app

    with TestClient(create_app()) as client:
        if login:
            response = client.post("/api/v1/auth/login", json=ADMIN)
            assert response.status_code == 200, response.text
        yield client
    db.reset_engine()
    get_settings.cache_clear()
    os.environ.pop("DB_URL", None)


@pytest.fixture
def api(tmp_path, monkeypatch):
    """Cliente de la API con la sesión de la cuenta inicial ya iniciada."""
    yield from _client(tmp_path, monkeypatch, login=True)


@pytest.fixture
def anon_api(tmp_path, monkeypatch):
    """Cliente de la API sin sesión."""
    yield from _client(tmp_path, monkeypatch, login=False)


@pytest.fixture
def limited_api(tmp_path, monkeypatch):
    """Cliente sin sesión con el rate limit activo y cupos pequeños."""
    yield from _client(
        tmp_path,
        monkeypatch,
        login=False,
        rate_limit={
            "RATE_LIMIT_ENABLED": "true",
            "RATE_LIMIT_PER_MIN": "6",
            "RATE_LIMIT_HEAVY_PER_MIN": "2",
            "RATE_LIMIT_LOGIN_PER_MIN": "3",
        },
    )


def drain_queue() -> list[str]:
    """Ejecuta de forma síncrona todas las corridas en cola (hace de worker en las pruebas)."""
    from app.services.run_service import process_next_run

    processed = []
    while (run_id := process_next_run()) is not None:
        processed.append(run_id)
    return processed
