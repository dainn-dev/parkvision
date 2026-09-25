from functools import lru_cache

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PV_", extra="ignore")

    env: str = "dev"
    api_base_url: str = "http://localhost:8000"

    database_dsn: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://app_user:app_password@localhost:5432/vehicle_mgmt"
    )
    migration_dsn: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt"
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20

    redis_dsn: RedisDsn = RedisDsn("redis://localhost:6379/0")

    jwt_secret: str = Field(default="dev-insecure-secret-change-me")
    jwt_previous_secrets: str = ""  # comma-separated, enables key rotation
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30
    mfa_pending_ttl_seconds: int = 300

    cookie_secure: bool = False
    cookie_domain: str | None = None
    cookie_samesite: str = "lax"
    access_cookie: str = "pv_access"
    refresh_cookie: str = "pv_refresh"
    csrf_cookie: str = "pv_csrf"

    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_topic_prefix: str = "tenants"

    s3_endpoint: str = "localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"  # noqa: S105 (local dev default)
    s3_bucket: str = "anpr-images"
    s3_secure: bool = False
    s3_presign_ttl_seconds: int = 900

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "no-reply@parkvision.dev"
    smtp_starttls: bool = False

    invite_url_base: str = "http://localhost:3000/accept-invite"
    export_ttl_seconds: int = 3600
    edge_offline_after_seconds: int = 90
    gate_command_timeout_seconds: int = 15

    bootstrap_admin_email: str = "admin@parkvision.dev"
    bootstrap_admin_password: str = "ChangeMe!234"  # noqa: S105 (local dev default)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwt_secrets(self) -> list[str]:
        return [self.jwt_secret, *[s for s in self.jwt_previous_secrets.split(",") if s]]


@lru_cache
def get_settings() -> Settings:
    return Settings()
