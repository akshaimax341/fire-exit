from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "FireExit Digital Twin"
    SECRET_KEY: str = "fireexit-digital-twin-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite+aiosqlite:///./fireexit.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_TOPIC_PREFIX: str = "fireexit"
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    SIMULATION_TICK_MS: int = 200
    PATHFINDING_LATENCY_TARGET_MS: int = 300

    class Config:
        env_file = ".env"


settings = Settings()
