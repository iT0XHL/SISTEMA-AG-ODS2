"""Configuración por entorno (plan §10.1). Ningún secreto vive en el código."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import __version__


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
