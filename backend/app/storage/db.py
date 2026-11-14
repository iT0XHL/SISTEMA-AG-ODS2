"""Motor y sesiones SQLAlchemy. ``DB_URL`` decide entre PostgreSQL y SQLite."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.storage.models import Base

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record) -> None:  # pragma: no cover
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _make_engine(get_settings().db_url)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _session_factory


def init_db() -> None:
    """Crea las tablas si no existen (idempotente)."""
    Base.metadata.create_all(get_engine())


def reset_engine() -> None:
    """Descarta el motor en caché (lo usan las pruebas al cambiar ``DB_URL``)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
