"""Inicio de sesión: cuentas en la base de datos, cookies, protección de la API y bloqueos."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app import auth
from app.config import get_settings
from app.storage.db import session_scope
from app.storage.models import AppUser, AuthSession
from tests.conftest import ADMIN

API = "/api/v1"
PROTECTED = (
    ("GET", f"{API}/scenarios"),
    ("POST", f"{API}/scenarios/demo"),
    ("GET", f"{API}/runs"),
    ("GET", f"{API}/experiments"),
    ("POST", f"{API}/baselines"),
)


def login(client, username: str = ADMIN["username"], password: str = ADMIN["password"]):
    return client.post(f"{API}/auth/login", json={"username": username, "password": password})


def test_public_routes_stay_open(anon_api) -> None:
    assert anon_api.get("/health").status_code == 200
    assert anon_api.get(f"{API}/meta").status_code == 200


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_protected_routes_require_a_session(anon_api, method: str, path: str) -> None:
    response = anon_api.request(method, path, json={})
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"code", "message", "field", "details"}
    assert body["code"] == "NOT_AUTHENTICATED"


def test_default_account_is_created_once_in_the_database(anon_api) -> None:
    with session_scope() as session:
        users = session.scalars(select(AppUser)).all()
        assert [u.username for u in users] == ["admin"]
        assert users[0].display_name == "Administrador"
        assert auth.ensure_default_user(session, get_settings()) is None  # no se duplica
    with session_scope() as session:
        assert len(session.scalars(select(AppUser)).all()) == 1


def test_password_is_stored_only_as_a_salted_hash(anon_api) -> None:
    with session_scope() as session:
        stored = session.scalar(select(AppUser.password_hash))
    assert stored.startswith("scrypt$")
    assert ADMIN["password"] not in stored
    assert auth.verify_password(ADMIN["password"], stored)
    assert not auth.verify_password("otra-clave", stored)
    assert auth.hash_password(ADMIN["password"]) != stored  # la sal cambia cada vez


def test_login_me_and_logout_flow(anon_api) -> None:
    assert anon_api.get(f"{API}/auth/me").status_code == 401

    response = login(anon_api)
    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"username": "admin", "display_name": "Administrador"}
    assert set(body) == {"user", "token"}
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie

    assert anon_api.get(f"{API}/auth/me").json()["user"]["username"] == "admin"
    assert anon_api.get(f"{API}/scenarios").status_code == 200

    assert anon_api.post(f"{API}/auth/logout").status_code == 204
    assert anon_api.get(f"{API}/auth/me").status_code == 401
    assert anon_api.get(f"{API}/scenarios").status_code == 401


def test_session_token_is_not_stored_in_clear(anon_api) -> None:
    login(anon_api)
    token = anon_api.cookies.get(auth.SESSION_COOKIE)
    with session_scope() as session:
        hashes = session.scalars(select(AuthSession.token_hash)).all()
    assert token and token not in hashes and len(hashes) == 1 and len(hashes[0]) == 64


@pytest.mark.parametrize(
    ("username", "password"),
    [("admin", "incorrecta"), ("desconocido", "NutriRuta2026!"), ("admin", "x")],
)
def test_wrong_credentials_get_the_same_generic_error(anon_api, username, password) -> None:
    response = login(anon_api, username, password)
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "INVALID_CREDENTIALS"
    assert body["message"] == "Usuario o contraseña incorrectos."


def test_username_is_case_insensitive_and_trimmed(anon_api) -> None:
    assert login(anon_api, "  ADMIN ").status_code == 200


def test_validation_errors_use_the_standard_shape(anon_api) -> None:
    response = anon_api.post(f"{API}/auth/login", json={"username": "", "password": ""})
    assert response.status_code == 422
    assert set(response.json()) == {"code", "message", "field", "details"}


def test_account_locks_after_repeated_failures_and_recovers(anon_api, monkeypatch) -> None:
    for _ in range(5):
        assert login(anon_api, password="mal").status_code == 401
    locked = login(anon_api)  # aunque la clave sea correcta
    assert locked.status_code == 429
    body = locked.json()
    assert body["code"] == "TOO_MANY_ATTEMPTS" and body["details"]["retry_after"] >= 1

    now = auth.LoginThrottle._clock()
    monkeypatch.setattr(auth.LoginThrottle, "_clock", staticmethod(lambda: now + 120))
    assert login(anon_api).status_code == 200


def test_expired_session_is_rejected(anon_api) -> None:
    login(anon_api)
    with session_scope() as session:
        row = session.scalars(select(AuthSession)).one()
        row.expires_at = auth.utcnow() - timedelta(minutes=1)
    assert anon_api.get(f"{API}/auth/me").status_code == 401


def test_inactive_account_cannot_sign_in(anon_api) -> None:
    with session_scope() as session:
        session.scalars(select(AppUser)).one().is_active = False
    assert login(anon_api).status_code == 401


def test_users_can_be_added_and_changed(anon_api) -> None:
    with session_scope() as session:
        user = auth.add_user(session, "Ana", "Ana Quispe", "clave-segura-1")
        assert user.username == "ana"
        with pytest.raises(ValueError, match="Ya existe"):
            auth.add_user(session, "ana", "Otra", "clave-segura-2")
        with pytest.raises(ValueError, match="al menos"):
            auth.add_user(session, "beto", "Beto", "corta")

    assert login(anon_api, "ana", "clave-segura-1").status_code == 200
    anon_api.post(f"{API}/auth/logout")

    with session_scope() as session:
        auth.set_password(session, "ana", "clave-nueva-123")
    assert login(anon_api, "ana", "clave-segura-1").status_code == 401
    assert login(anon_api, "ana", "clave-nueva-123").status_code == 200


def test_changing_a_password_closes_that_users_sessions(anon_api) -> None:
    login(anon_api)
    with session_scope() as session:
        auth.set_password(session, "admin", "otra-clave-123")
    assert anon_api.get(f"{API}/auth/me").status_code == 401


def test_cli_lists_and_adds_accounts(anon_api, capsys) -> None:
    from app import users

    assert (
        users.main(["add", "--username", "luis", "--name", "Luis", "--password", "clave-segura-9"])
        == 0
    )
    assert users.main(["add", "--username", "luis", "--password", "clave-segura-9"]) == 1
    assert users.main(["list"]) == 0
    output = capsys.readouterr().out
    assert "luis" in output and "admin" in output


def test_bearer_token_authenticates_without_cookies(anon_api) -> None:
    """Un frontend en otro dominio guarda el token del login y lo envía como Bearer."""
    login = anon_api.post("/api/v1/auth/login", json=ADMIN)
    assert login.status_code == 200
    token = login.json()["token"]
    assert token and token == anon_api.cookies.get(auth.SESSION_COOKIE)
    anon_api.cookies.clear()
    assert anon_api.get(f"{API}/auth/me").status_code == 401
    bearer = {"Authorization": f"Bearer {token}"}
    assert anon_api.get(f"{API}/auth/me", headers=bearer).json()["user"]["username"] == "admin"
    assert anon_api.get(f"{API}/scenarios", headers=bearer).status_code == 200
    assert (
        anon_api.get(f"{API}/scenarios", headers={"Authorization": "Bearer falso"}).status_code
        == 401
    )
    # Cerrar sesión con el token la revoca
    assert anon_api.post(f"{API}/auth/logout", headers=bearer).status_code == 204
    assert anon_api.get(f"{API}/auth/me", headers=bearer).status_code == 401


def test_cors_preflight_allows_authorization_header(anon_api, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("CORS_ORIGINS", "https://main.d123.amplifyapp.com")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as client:
        response = client.options(
            f"{API}/scenarios",
            headers={
                "Origin": "https://main.d123.amplifyapp.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://main.d123.amplifyapp.com"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    get_settings.cache_clear()
