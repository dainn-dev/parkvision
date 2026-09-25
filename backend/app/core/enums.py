import enum


class StrEnum(str, enum.Enum):
    def __str__(self) -> str:
        return self.value


class ActorType(StrEnum):
    TENANT_USER = "tenant_user"
    PLATFORM_ADMIN = "platform_admin"
    DEVICE = "edge_device"
    SYSTEM = "system"


class TenantStatus(StrEnum):
    TRIAL = "trial"
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
    OPS = "ops"


class AccountStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    DISABLED = "disabled"


class LaneDirection(StrEnum):
    ENTRY = "entry"
    EXIT = "exit"
    BIDIRECTIONAL = "bidirectional"


class GateState(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    OPENING = "opening"
    CLOSING = "closing"
    LOCKED = "locked"
    FAULT = "fault"
    UNKNOWN = "unknown"


class GateCommand(StrEnum):
    OPEN = "open"
    CLOSE = "close"
    LOCK = "lock"
    UNLOCK = "unlock"
    REBOOT = "reboot"
    RELINK = "relink"


class CommandStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    TIMEOUT = "timeout"
    FAILED = "failed"


class DeviceStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    PROVISIONING = "provisioning"
    DISABLED = "disabled"


class VehicleTag(StrEnum):
    STANDARD = "standard"
    STAFF = "staff"
    RESIDENT = "resident"
    VIP = "vip"
    BLACKLIST = "blacklist"


class VehicleStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class RuleType(StrEnum):
    ALLOW_LIST = "allow_list"
    DENY_LIST = "deny_list"
    SCHEDULE = "schedule"
    QUOTA = "quota"


class AccessDecision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class EventDirection(StrEnum):
    ENTRY = "entry"
    EXIT = "exit"


class EventSource(StrEnum):
    ANPR = "anpr"
    MANUAL = "manual"
    REMOTE = "remote"


class IncidentType(StrEnum):
    OBSTACLE = "obstacle"
    FORCED_ENTRY = "forced_entry"
    FAULT = "fault"
    OFFLINE = "offline"
    UNAUTHORIZED_ACCESS = "unauthorized_access"


class IncidentSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVING = "resolving"
    RESOLVED = "resolved"


class LegalDoc(StrEnum):
    TERMS = "terms"
    PRIVACY = "privacy"
    DPA = "dpa"
