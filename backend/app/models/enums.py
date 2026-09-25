"""Domain enums mirrored by CHECK constraints in the DDL."""

from enum import StrEnum


class TenantStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class TenantUserRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class PlatformAdminRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    SUPPORT = "support"
    READONLY = "readonly"


class AccountStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DISABLED = "disabled"


class DeviceStatus(StrEnum):
    PAIRING = "pairing"
    ONLINE = "online"
    OFFLINE = "offline"
    DECOMMISSIONED = "decommissioned"


class LaneDirection(StrEnum):
    ENTRY = "entry"
    EXIT = "exit"
    BIDIRECTIONAL = "bidirectional"


class GateType(StrEnum):
    BARRIER = "barrier"
    SLIDING = "sliding"
    SWING = "swing"
    BOLLARD = "bollard"


class GateState(StrEnum):
    OPEN = "open"
    OPENING = "opening"
    CLOSED = "closed"
    CLOSING = "closing"
    LOCKED = "locked"
    FAULT = "fault"
    UNKNOWN = "unknown"


class IncidentKind(StrEnum):
    FORCED_OPEN = "forced_open"
    OBSTRUCTION = "obstruction"
    FAULT = "fault"
    OFFLINE = "offline"
    UNAUTHORIZED_PLATE = "unauthorized_plate"
    TAILGATING = "tailgating"


class IncidentSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class IncidentStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class VehicleStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    EXPIRED = "expired"


class RuleEffect(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class AccessDecision(StrEnum):
    ALLOWED = "allowed"
    DENIED = "denied"
    REVIEW = "review"


class CommandAction(StrEnum):
    OPEN = "open"
    CLOSE = "close"
    LOCK = "lock"
    UNLOCK = "unlock"


class CommandStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    EXECUTED = "executed"
    TIMEOUT = "timeout"
    FAILED = "failed"


class RegistrationStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ActorKind(StrEnum):
    TENANT_USER = "tenant_user"
    PLATFORM_ADMIN = "platform_admin"
    EDGE_DEVICE = "edge_device"
    SYSTEM = "system"


class InviteStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"
