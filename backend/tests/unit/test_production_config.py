"""Configuración de producción: no se aceptan los valores de demostración."""

from __future__ import annotations

import pytest

from app.config import DEFAULT_ADMIN_PASSWORD, Settings

GOOD = {
    "APP_ENV": "production",
    "ADMIN_PASSWORD": "una-clave-larga-y-propia",
    "DB_URL": "postgresql+psycopg://app:clave-de-base-propia@db:5432/nutriruta",
}


def settings(**overrides: str) -> Settings:
    return Settings(**{**GOOD, **overrides}, _env_file=None)


def test_a_complete_production_configuration_has_no_problems() -> None:
    assert settings().production_problems() == []


@pytest.mark.parametrize(
    ("override", "fragment"),
    [
        ({"ADMIN_PASSWORD": DEFAULT_ADMIN_PASSWORD}, "contraseña de demostración"),
        ({"ADMIN_PASSWORD": "corta"}, "al menos 12"),
        (
            {"DB_URL": "postgresql+psycopg://a:nutriruta_local@db/x"},
            "base de datos de demostración",
        ),
        ({"DB_URL": "sqlite:///./x.db"}, "SQLite"),
        ({"RATE_LIMIT_ENABLED": "false"}, "RATE_LIMIT_ENABLED"),
    ],
)
def test_demo_values_are_reported(override: dict[str, str], fragment: str) -> None:
    assert any(fragment in problem for problem in settings(**override).production_problems())


def test_production_forces_secure_cookies() -> None:
    assert settings().secure_cookies is True
    assert Settings(APP_ENV="development", _env_file=None).secure_cookies is False


def test_the_app_refuses_to_start_with_demo_values(monkeypatch, tmp_path) -> None:
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import create_app
    from app.storage import db

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DB_URL", f"sqlite:///{tmp_path / 'x.db'}")
    get_settings.cache_clear()
    db.reset_engine()
    try:
        with pytest.raises(RuntimeError, match="no apta para producción"), TestClient(create_app()):
            pass
    finally:
        get_settings.cache_clear()
        db.reset_engine()
