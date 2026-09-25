"""Application settings loaded from environment / .env."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    api_base_url: str = "http://localhost:8000"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Runtime DSN — use a non-superuser so RLS is enforced. Alembic uses
    # migration_database_url (falls back to database_url when unset).
    database_url: str = "postgresql+asyncpg://parkvision_app:parkvision_app@localhost:5432/parkvision"
    migration_database_url: str | None = None
    db_pool_size: int = 10
    db_max_overflow: int = 10

    redis_url: str = "redis://localhost:6379/0"

    # [{"kid": "...", "key": "..."}]; keys[0] signs, all verify (prepend to rotate).
    jwt_keys: list[dict[str, str]] = [{"kid": "local-1", "key": "dev-only-change-me"}]
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 30 * 86400
    mfa_token_ttl_seconds: int = 300

    cookie_secure: bool = False
    cookie_domain: str | None = None
    cookie_samesite: str = "lax"

    mfa_secret_key: str = "change-me-fernet-key"  # noqa: S105 — placeholder default, override via env

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_tls: bool = False
    gate_command_timeout_seconds: int = 15
    edge_offline_after_seconds: int = 90

    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"  # noqa: S105 — local MinIO default credential
    s3_bucket: str = "parkvision-snapshots"
    s3_presign_ttl_seconds: int = 900

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@parkvision.local"
    smtp_tls: bool = False

    partition_lookahead_periods: int = 2

    bootstrap_platform_admin_email: str | None = None
    bootstrap_platform_admin_password: str | None = None

    @field_validator("jwt_keys", mode="before")
    @classmethod
    def _jwt_keys_json(cls, v: object) -> object:
        if isinstance(v, str):
            import json

            return json.loads(v)
        return v

    @property
    def jwt_signing(self) -> tuple[str, str]:
        first = self.jwt_keys[0]
        return first["kid"], first["key"]

    @property
    def jwt_verify_map(self) -> dict[str, str]:
        return {k["kid"]: k["key"] for k in self.jwt_keys}


@lru_cache
def get_settings() -> Settings:
    return Settings()
