from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "vehicle-management"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt"
    migration_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-32-byte-minimum-secret"
    jwt_previous_secrets: list[str] = []
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 14

    cookie_domain: str | None = None
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    csrf_cookie_name: str = "vm_csrf"
    access_cookie_name: str = "vm_access"
    refresh_cookie_name: str = "vm_refresh"

    field_encryption_key: str = "change-me-fernet-key"

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = "backend"
    mqtt_password: str = "backend-secret"
    mqtt_tls: bool = False
    mqtt_command_timeout_seconds: int = 15

    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "test"
    s3_secret_key: str = "test"
    s3_bucket: str = "vehicle-events"
    s3_presign_ttl_seconds: int = 900

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@parkvision.example.com"
    smtp_tls: bool = False
    app_base_url: str = "http://localhost:3000"

    cors_origins: list[str] = ["http://localhost:3000"]

    seed_platform_admin_email: str = "admin@example.com"
    seed_platform_admin_password: str = "ChangeMe!123"

    @field_validator("jwt_previous_secrets", "cors_origins", mode="before")
    @classmethod
    def split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("["):
                return v  # let pydantic parse JSON
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
