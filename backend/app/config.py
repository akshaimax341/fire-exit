from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_CORS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]


def _normalize_database_url(url: str) -> str:
    """Railway/Heroku give postgresql://; SQLAlchemy async needs +asyncpg."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "FireExit Digital Twin"
    SECRET_KEY: str = "fireexit-digital-twin-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite+aiosqlite:///./fireexit.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_TOPIC_PREFIX: str = "fireexit"
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: list(_DEFAULT_CORS))
    SIMULATION_TICK_MS: int = 200
    PATHFINDING_LATENCY_TARGET_MS: int = 300

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_db_url(cls, v: object) -> object:
        if isinstance(v, str) and v.strip():
            return _normalize_database_url(v.strip())
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> object:
        """Accept JSON list or comma-separated CORS_ORIGINS env string."""
        if v is None or v == "":
            return list(_DEFAULT_CORS)
        if isinstance(v, str):
            parts = [p.strip() for p in v.split(",") if p.strip()]
            return parts or list(_DEFAULT_CORS)
        return v


settings = Settings()
