"""Rate limit: ventana deslizante, cupos por categoría y respuesta 429."""

from __future__ import annotations

from app.config import Settings
from app.ratelimit import RateLimiter, classify

API = "/api/v1"


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_window_slides_and_reports_the_wait() -> None:
    clock = Clock()
    limiter = RateLimiter(clock)
    assert [limiter.hit("api", "a", 3) for _ in range(3)] == [0, 0, 0]
    wait = limiter.hit("api", "a", 3)
    assert 1 <= wait <= 61
    clock.now += 61
    assert limiter.hit("api", "a", 3) == 0


def test_clients_and_buckets_are_independent() -> None:
    limiter = RateLimiter(Clock())
    assert limiter.hit("api", "a", 1) == 0
    assert limiter.hit("api", "a", 1) > 0
    assert limiter.hit("api", "b", 1) == 0
    assert limiter.hit("heavy", "a", 1) == 0


def test_requests_are_classified_by_cost() -> None:
    settings = Settings()
    assert classify("POST", f"{API}/auth/login", settings) == ("login", 10)
    assert classify("POST", f"{API}/runs", settings) == ("heavy", 30)
    assert classify("POST", f"{API}/experiments/four-runs", settings) == ("heavy", 30)
    assert classify("POST", f"{API}/imports/padron/preview", settings) == ("heavy", 30)
    assert classify("GET", f"{API}/runs/abc", settings) == ("api", 1200)
    assert classify("GET", "/health", settings) is None
    assert classify("GET", "/assets/app.js", settings) is None
