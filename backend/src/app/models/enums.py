"""Enumerations mirrored by database CHECK constraints."""

from enum import StrEnum


class TenantStatus(StrEnum):
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class TenantUserRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class PlatformAdminRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    SUPPORT = "support"
    READ_ONLY = "read_only"


class AccountStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    LOCKED = "locked"


class SubjectType(StrEnum):
    TENANT_USER = "tenant_user"
    PLATFORM_ADMIN = "platform_admin"


class EdgeDeviceKind(StrEnum):
    GATEWAY = "gateway"
    CAMERA = "camera"
    CONTROLLER = "controller"


class EdgeDeviceStatus(StrEnum):
    PROVISIONING = "provisioning"
    ONLINE = "online"
    OFFLINE = "offline"
    DISABLED = "disabled"


class LaneDirection(StrEnum):
    IN = "in"
    OUT = "out"
    BIDIRECTIONAL = "bidirectional"


class LaneKind(StrEnum):
    VEHICLE = "vehicle"
    PEDESTRIAN = "pedestrian"
    MIXED = "mixed"


class ControllerKind(StrEnum):
    BARRIER = "barrier"
    SHUTTER = "shutter"
    BOLLARD = "bollard"
    TURNSTILE = "turnstile"


class GateState(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    OPENING = "opening"
    CLOSING = "closing"
    STOPPED = "stopped"
    LOCKED = "locked"
    UNKNOWN = "unknown"


class IncidentKind(StrEnum):
    OBSTRUCTION = "obstruction"
    FORCED_OPEN = "forced_open"
    TAILGATING = "tailgating"
    SENSOR_FAULT = "sensor_fault"
    OFFLINE = "offline"
    OTHER = "other"


class IncidentSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class IncidentStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class VehicleKind(StrEnum):
    CAR = "car"
    TRUCK = "truck"
    MOTORBIKE = "motorbike"
    VAN = "van"
    OTHER = "other"


class VehicleStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REVOKED = "revoked"


class RuleEffect(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class AccessDecision(StrEnum):
    ALLOWED = "allowed"
    DENIED = "denied"
    REVIEW = "review"


class EventDirection(StrEnum):
    IN = "in"
    OUT = "out"


class ActorType(StrEnum):
    TENANT_USER = "tenant_user"
    PLATFORM_ADMIN = "platform_admin"
    SYSTEM = "system"
    EDGE = "edge"


class GateAction(StrEnum):
    OPEN = "open"
    CLOSE = "close"
    STOP = "stop"
    LOCK = "lock"
    UNLOCK = "unlock"


class CommandStatus(StrEnum):
    ACCEPTED = "accepted"
    ACKNOWLEDGED = "acknowledged"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class JobKind(StrEnum):
    VEHICLE_IMPORT = "vehicle_import"
    AUDIT_EXPORT = "audit_export"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"
    FAILED = "failed"


class InvitationPurpose(StrEnum):
    INVITE = "invite"
    PASSWORD_RESET = "password_reset"


class InvitationScope(StrEnum):
    TENANT_USER = "tenant_user"
    PLATFORM_ADMIN = "platform_admin"
