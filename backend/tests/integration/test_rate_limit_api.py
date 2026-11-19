"""El rate limit responde 429 con el formato de error estándar y deja libre lo que debe."""

from __future__ import annotations

API = "/api/v1"


def test_general_quota_returns_429_with_retry_after(limited_api) -> None:
    codes = [limited_api.get(f"{API}/meta").status_code for _ in range(6)]
    assert codes == [200] * 6
    blocked = limited_api.get(f"{API}/meta")
    assert blocked.status_code == 429
    body = blocked.json()
    assert set(body) == {"code", "message", "field", "details"}
    assert body["code"] == "RATE_LIMITED" and body["details"]["bucket"] == "api"
    assert int(blocked.headers["Retry-After"]) >= 1


def test_health_is_never_limited(limited_api) -> None:
    assert all(limited_api.get("/health").status_code == 200 for _ in range(20))


def test_login_has_its_own_stricter_quota(limited_api) -> None:
    attempts = [
        limited_api.post(f"{API}/auth/login", json={"username": "x", "password": "y"}).status_code
        for _ in range(4)
    ]
    assert attempts[:3] == [401, 401, 401]
    assert attempts[3] == 429


def test_heavy_operations_have_a_smaller_quota(limited_api) -> None:
    limited_api.post(f"{API}/auth/login", json={"username": "admin", "password": "NutriRuta2026!"})
    statuses = [limited_api.post(f"{API}/scenarios/demo").status_code for _ in range(3)]
    assert statuses[:2] == [200, 200]
    assert statuses[2] == 429


def test_each_client_ip_has_its_own_quota(limited_api) -> None:
    for _ in range(7):
        limited_api.get(f"{API}/meta", headers={"X-Real-IP": "10.0.0.1"})
    assert limited_api.get(f"{API}/meta", headers={"X-Real-IP": "10.0.0.1"}).status_code == 429
    assert limited_api.get(f"{API}/meta", headers={"X-Real-IP": "10.0.0.2"}).status_code == 200
