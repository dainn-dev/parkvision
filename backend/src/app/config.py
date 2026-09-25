from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    api_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://app_user:app_password@localhost:5432/parkvision"
    alembic_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/parkvision"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MQTT
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_tls: bool = False

    # S3-compatible object storage
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "parkvision-media"
    s3_region: str = "us-east-1"
    s3_presign_ttl_seconds: int = 900

    # Email
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_tls: bool = False
    smtp_from: str = "noreply@parkvision.dev"
    app_base_url: str = "http://localhost:8000"

    # Auth
    jwt_secret: str = "dev-only-change-me-in-prod-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 2_592_000
    mfa_ticket_ttl_seconds: int = 300
    mfa_secret_key: str = "NvTgnQnyFlkaCbyGBl1CZzU6aoFuXKZod8fxDL-3JYc="
    cookie_secure: bool = False
    cookie_domain: str | None = None
    csrf_enabled: bool = True

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Limits
    login_rate_limit_per_minute: int = 10
    gate_command_ack_timeout_seconds: float = 30.0
    edge_device_offline_seconds: int = 120
    image_retention_days: int = 180

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
