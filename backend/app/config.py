"""Configuración por entorno (plan §10.1). Ningún secreto vive en el código."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import __version__

DEFAULT_ADMIN_PASSWORD = "NutriRuta2026!"
DEFAULT_DB_PASSWORD = "nutriruta_local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    db_url: str = Field(default="sqlite:///./nutriruta.db", alias="DB_URL")
    min_centers: int = Field(default=5, alias="MIN_CENTERS")
    max_centers: int = Field(default=50, alias="MAX_CENTERS")
    max_vehicles: int = Field(default=20, alias="MAX_VEHICLES")
    max_generations: int = Field(default=1000, alias="MAX_GENERATIONS")
    max_population: int = Field(default=500, alias="MAX_POPULATION")
    max_upload_mb: float = Field(default=5.0, alias="MAX_UPLOAD_MB")
    max_json_mb: float = Field(default=2.0, alias="MAX_JSON_MB")
    max_run_seconds: float = Field(default=120.0, alias="MAX_RUN_SECONDS")
    cors_origins: str = Field(default="http://localhost:8090", alias="CORS_ORIGINS")
    worker_poll_seconds: float = Field(default=0.5, alias="WORKER_POLL_SECONDS")
    git_commit: str = Field(default="", alias="GIT_COMMIT")
    admin_username: str = Field(default="admin", alias="ADMIN_USERNAME")
    admin_password: str = Field(default=DEFAULT_ADMIN_PASSWORD, alias="ADMIN_PASSWORD")
    admin_name: str = Field(default="Administrador", alias="ADMIN_NAME")
    session_hours: float = Field(default=8.0, alias="SESSION_HOURS")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    login_max_attempts: int = Field(default=5, alias="LOGIN_MAX_ATTEMPTS")
    login_lock_seconds: float = Field(default=60.0, alias="LOGIN_LOCK_SECONDS")
    trusted_proxy_hops: int = Field(default=0, alias="TRUSTED_PROXY_HOPS")
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_per_min: int = Field(default=1200, alias="RATE_LIMIT_PER_MIN")
    rate_limit_heavy_per_min: int = Field(default=30, alias="RATE_LIMIT_HEAVY_PER_MIN")
    rate_limit_login_per_min: int = Field(default=10, alias="RATE_LIMIT_LOGIN_PER_MIN")

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"

    @property
    def secure_cookies(self) -> bool:
        """En producción la cookie de sesión siempre es ``Secure``."""
        return self.cookie_secure or self.is_production

    def production_problems(self) -> list[str]:
        """Valores de demostración que no pueden usarse con ``APP_ENV=production``."""
        problems: list[str] = []
        if self.admin_password == DEFAULT_ADMIN_PASSWORD:
            problems.append("ADMIN_PASSWORD conserva la contraseña de demostración.")
        if len(self.admin_password) < 12:
            problems.append("ADMIN_PASSWORD debe tener al menos 12 caracteres.")
        if DEFAULT_DB_PASSWORD in self.db_url:
            problems.append("DB_URL usa la contraseña de base de datos de demostración.")
        if self.db_url.startswith("sqlite"):
            problems.append("DB_URL apunta a SQLite; use PostgreSQL.")
        if not self.rate_limit_enabled:
            problems.append("RATE_LIMIT_ENABLED debe ser true.")
        return problems

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def code_version(self) -> str:
        commit = self.git_commit.strip()
        return f"{__version__}+{commit[:12]}" if commit else __version__

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)

    @property
    def max_json_bytes(self) -> int:
        return int(self.max_json_mb * 1024 * 1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()
