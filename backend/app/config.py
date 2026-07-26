from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Shared app settings. Others append fields here — don't restructure."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App identity / runtime mode
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"

    # Postgres — host differs between running on the developer's machine
    # (localhost) and running inside the backend container (the `postgres`
    # service name), so it's the one field docker-compose.yml overrides.
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str
    postgres_port: int = 5432

    # Redis
    redis_url: str

    # CORS
    cors_origins: str = "http://localhost:3000"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()