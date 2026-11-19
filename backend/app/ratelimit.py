"""Límite de solicitudes por cliente con ventana deslizante, sin dependencias externas.

Los contadores viven en memoria del proceso de la API: sirven para una instancia local y se
reinician al reiniciar el servicio. Hay tres cupos por minuto y por cliente:

* ``login``: intentos de inicio de sesión.
* ``heavy``: operaciones costosas (encolar corridas, importar archivos, guardar escenarios).
* ``api``: el resto de consultas de la API.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from app.config import Settings

WINDOW_SECONDS = 60.0
_MAX_TRACKED_KEYS = 5000

_HEAVY_PREFIXES = (
    "/api/v1/runs",
    "/api/v1/experiments/four-runs",
    "/api/v1/imports/",
    "/api/v1/scenarios",
)


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, bucket: str, key: str, limit: int, window: float = WINDOW_SECONDS) -> int:
        """Registra una solicitud. Devuelve 0 si pasa o los segundos que faltan para reintentar."""
        now = self._clock()
        with self._lock:
            if len(self._hits) > _MAX_TRACKED_KEYS:
                self._prune(now, window)
            queue = self._hits.setdefault((bucket, key), deque())
            while queue and now - queue[0] >= window:
                queue.popleft()
            if len(queue) >= limit:
                return max(1, int(window - (now - queue[0])) + 1)
            queue.append(now)
            return 0

    def _prune(self, now: float, window: float) -> None:
        stale = [k for k, q in self._hits.items() if not q or now - q[-1] >= window]
        for key in stale:
            del self._hits[key]


def client_key(request: Request, trusted_hops: int = 0) -> str:
    """IP del cliente.

    Con ``trusted_hops > 0`` (p. ej. 2 detrás de CloudFront + ALB) se toma de
    ``X-Forwarded-For`` la entrada que añadió el primer proxy de confianza, ignorando lo que el
    cliente haya escrito antes. Sin saltos, nginx la fija en ``X-Real-IP``; sin proxy se usa la
    conexión directa.
    """
    if trusted_hops > 0:
        chain = [
            p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()
        ]
        if len(chain) >= trusted_hops:
            return chain[-trusted_hops]
    forwarded = request.headers.get("x-real-ip", "").strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "desconocido"


def classify(method: str, path: str, settings: Settings) -> tuple[str, int] | None:
    """Cupo que corresponde a una solicitud, o ``None`` si no se limita."""
    if not path.startswith("/api/"):
        return None
    if method == "POST" and path == "/api/v1/auth/login":
        return "login", settings.rate_limit_login_per_min
    if method == "POST" and path.startswith(_HEAVY_PREFIXES):
        return "heavy", settings.rate_limit_heavy_per_min
    return "api", settings.rate_limit_per_min
