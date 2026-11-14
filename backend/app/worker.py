"""Worker de corridas: saca trabajos de la cola (tabla ``run``) y ejecuta el AG.

El servidor HTTP nunca ejecuta el algoritmo: solo encola. Este proceso aislado toma
las corridas una por una (sin paralelismo, para que sean reproducibles y el tiempo de
CPU sea comparable), publica el progreso por generación y atiende cancelaciones.

Uso: ``python -m app.worker``
"""

from __future__ import annotations

import logging
import signal
import time

from sqlalchemy.exc import OperationalError

from app.config import get_settings
from app.services.run_service import process_next_run
from app.storage import repository as repo
from app.storage.db import init_db, session_scope

logger = logging.getLogger("nutriruta.worker")
_running = True


def _stop(*_: object) -> None:
    global _running
    _running = False
    logger.info("Señal de parada recibida: el worker terminará tras la corrida actual.")


def wait_for_database(retries: int = 60, delay: float = 1.0) -> None:
    for attempt in range(1, retries + 1):
        try:
            init_db()
            return
        except OperationalError:
            logger.info("Base de datos no disponible (intento %s/%s)…", attempt, retries)
            time.sleep(delay)
    raise SystemExit("No se pudo conectar a la base de datos.")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings = get_settings()
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    wait_for_database()
    with session_scope() as session:
        recovered = repo.recover_interrupted_runs(session)
    if recovered:
        logger.warning("%s corrida(s) interrumpida(s) marcadas como fallidas.", recovered)
    logger.info("Worker listo (versión %s).", settings.code_version)

    while _running:
        try:
            run_id = process_next_run()
        except OperationalError:
            logger.warning("Conexión a la base de datos perdida; reintentando…")
            time.sleep(2.0)
            continue
        if run_id is None:
            time.sleep(settings.worker_poll_seconds)
        else:
            logger.info("Corrida %s procesada.", run_id)


if __name__ == "__main__":
    main()
