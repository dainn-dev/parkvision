"""SQLAlchemy models. Partitioned tables declare composite PKs to match DDL."""

from app.models.base import Base
from app.models.identity import (
    FeatureFlag,
    LegalDocument,
    PasswordReset,
    PlatformAdmin,
    PlatformSetting,
    SubscriptionPlan,
    Tenant,
    TenantRegistration,
    TenantUser,
    UserInvite,
    UserSession,
)
from app.models.operations import (
    AccessEvent,
    AccessRule,
    AuditLog,
    BarrierIncident,
    GateCommand,
    GateTelemetryLog,
    RegisteredVehicle,
)
from app.models.sites import BarrierGate, EdgeDevice, Site, SiteLane

__all__ = [
    "AccessEvent",
    "AccessRule",
    "AuditLog",
    "BarrierGate",
    "BarrierIncident",
    "Base",
    "EdgeDevice",
    "FeatureFlag",
    "GateCommand",
    "GateTelemetryLog",
    "LegalDocument",
    "PasswordReset",
    "PlatformAdmin",
    "PlatformSetting",
    "RegisteredVehicle",
    "Site",
    "SiteLane",
    "SubscriptionPlan",
    "Tenant",
    "TenantRegistration",
    "TenantUser",
    "UserInvite",
    "UserSession",
]
