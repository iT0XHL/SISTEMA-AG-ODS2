"""Esquema relacional (plan §6.3). Funciona en PostgreSQL y en SQLite.

Tablas: ``scenario``, ``center``, ``vehicle``, ``distance``, ``experiment``, ``run``,
``generation`` y ``solution``, más ``app_user`` y ``auth_session`` para el inicio de sesión
(cuentas de la aplicación; no guardan datos de beneficiarios).

No existen —ni deben crearse— tablas ni columnas de DNI, personas o beneficiarios:
el modelo trabaja con centros (instituciones) y lotes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Scenario(Base):
    __tablename__ = "scenario"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    origin: Mapped[str] = mapped_column(String(20))  # synthetic | official | declared | mixed
    version: Mapped[str] = mapped_column(String(20))  # versión del esquema de escenario
    hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    distance_mode: Mapped[str] = mapped_column(String(20))  # haversine_demo | road_matrix
    distance_source: Mapped[str | None] = mapped_column(String(120))
    depot: Mapped[dict[str, Any]] = mapped_column(JSON)  # {id, name, lat, lon}
    inventory_lots: Mapped[int] = mapped_column(Integer)
    data_license: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    priority_criterion: Mapped[str | None] = mapped_column(Text)
    demand_rule: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    fixture_seed: Mapped[int | None] = mapped_column(Integer)

    centers: Mapped[list[Center]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", order_by="Center.center_id"
    )
    vehicles: Mapped[list[Vehicle]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", order_by="Vehicle.vehicle_id"
    )
    distances: Mapped[list[Distance]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("inventory_lots >= 0", name="ck_scenario_inventory"),)


class Center(Base):
    __tablename__ = "center"

    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("scenario.id", ondelete="CASCADE"), primary_key=True
    )
    center_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # nombre institucional, nunca de personas
    district: Mapped[str | None] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(250))  # dirección institucional
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    demand_lots: Mapped[int] = mapped_column(Integer)
    priority_weight: Mapped[int] = mapped_column(Integer)
    data_origin: Mapped[str] = mapped_column(String(20))  # synthetic | official | declared
    demand_origin: Mapped[str] = mapped_column(String(20))  # synthetic | declared | inferred
    users_aggregate: Mapped[int | None] = mapped_column(Integer)  # solo cifra agregada

    scenario: Mapped[Scenario] = relationship(back_populates="centers")

    __table_args__ = (
        CheckConstraint("demand_lots >= 0", name="ck_center_demand"),
        CheckConstraint("priority_weight BETWEEN 1 AND 3", name="ck_center_priority"),
    )


class Vehicle(Base):
    __tablename__ = "vehicle"

    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("scenario.id", ondelete="CASCADE"), primary_key=True
    )
    vehicle_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    capacity_lots: Mapped[int] = mapped_column(Integer)

    scenario: Mapped[Scenario] = relationship(back_populates="vehicles")

    __table_args__ = (CheckConstraint("capacity_lots > 0", name="ck_vehicle_capacity"),)


class Distance(Base):
    __tablename__ = "distance"

    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("scenario.id", ondelete="CASCADE"), primary_key=True
    )
    from_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    to_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    km: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(120))  # haversine | road_csv | …

    scenario: Mapped[Scenario] = relationship(back_populates="distances")

    __table_args__ = (CheckConstraint("km >= 0", name="ck_distance_km"),)


class Experiment(Base):
    """Agrupa las cuatro corridas oficiales (semillas 11/22/33/44) de un escenario."""

    __tablename__ = "experiment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenario.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    seeds: Mapped[list[int]] = mapped_column(JSON)
    parameters_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    scenario_hash: Mapped[str] = mapped_column(String(64))
    code_version: Mapped[str] = mapped_column(String(60))

    runs: Mapped[list[Run]] = relationship(back_populates="experiment", order_by="Run.seed")


class Run(Base):
    __tablename__ = "run"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenario.id", ondelete="CASCADE"))
    experiment_id: Mapped[str | None] = mapped_column(
        ForeignKey("experiment.id", ondelete="CASCADE")
    )
    seed: Mapped[int] = mapped_column(Integer)
    parameters_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(12), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    code_version: Mapped[str] = mapped_column(String(60))
    scenario_hash: Mapped[str] = mapped_column(String(64))
    queue_order: Mapped[int] = mapped_column(Integer, default=0)
    progress_generation: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    stop_reason: Mapped[str | None] = mapped_column(String(30))
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)

    experiment: Mapped[Experiment | None] = relationship(back_populates="runs")
    generations: Mapped[list[Generation]] = relationship(
        cascade="all, delete-orphan", order_by="Generation.number"
    )
    solution: Mapped[Solution | None] = relationship(cascade="all, delete-orphan", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','completed','failed','cancelled')",
            name="ck_run_status",
        ),
        Index("ix_run_queue", "status", "created_at", "queue_order"),
    )


class Generation(Base):
    __tablename__ = "generation"

    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), primary_key=True)
    number: Mapped[int] = mapped_column(Integer, primary_key=True)
    best_fitness: Mapped[float] = mapped_column(Float)
    mean_fitness: Mapped[float] = mapped_column(Float)
    best_J: Mapped[float] = mapped_column("best_j", Float)
    diversity: Mapped[float] = mapped_column(Float)


class Solution(Base):
    __tablename__ = "solution"

    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), primary_key=True)
    chromosome_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    decoded_routes_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    validation_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    assignments_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    repair_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    baseline_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class AppUser(Base):
    """Cuenta de acceso a la aplicación. La contraseña solo se guarda como hash scrypt."""

    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    """Sesión abierta. Se guarda el SHA-256 del token; el token en claro solo vive en la cookie."""

    __tablename__ = "auth_session"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
