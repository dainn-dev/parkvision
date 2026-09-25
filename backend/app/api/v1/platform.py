"""Platform-admin endpoints: tenant governance, admins, settings, flags, infra."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select, update

from app.api.deps import AuthContext, require_platform_admin
from app.core.enums import ActorType, PlatformAdminRole
from app.core.errors import conflict, not_found
from app.database import platform_session
from app.models import (
    AccessEvent,
    AuditLog,
    BarrierGate,
    BarrierIncident,
    EdgeDevice,
    FeatureFlag,
    GateCommand,
    GateTelemetryLog,
    PlatformAdmin,
    PlatformSetting,
    Tenant,
    TenantSite,
    TenantUser,
    UserSession,
)
from app.schemas.auth import SessionOut
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    AuditLogOut,
    EdgeRebootOut,
    FeatureFlagIn,
    FeatureFlagOut,
    MetricsOverviewOut,
    PlatformAdminIn,
    PlatformAdminOut,
    PlatformSettingIn,
    PlatformSettingOut,
    SnapshotDevice,
    SnapshotGate,
    TelemetrySnapshotOut,
    TenantCreateIn,
    TenantOut,
    TenantUpdateIn,
    ThroughputChartOut,
    ThroughputPoint,
)
from app.security import hash_password
from app.services.audit_service import write_audit
from app.services.command_service import issue_command
from app.services.infra_service import infra_status

router = APIRouter(
    prefix="/platform",
    tags=["platform"],
    dependencies=[Depends(require_platform_admin())],
)


# ---------- tenants ----------
@router.get("/tenants", response_model=Page[TenantOut])
async def list_tenants(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = None,
    search: str | None = None,
) -> Page[TenantOut]:
    async with platform_session() as db:
        q = select(Tenant)
        count_q = select(func.count()).select_from(Tenant)
        if status:
            q = q.where(Tenant.status == status)
            count_q = count_q.where(Tenant.status == status)
        if search:
            like = f"%{search}%"
            cond = or_(Tenant.name.ilike(like), Tenant.slug.ilike(like))
            q = q.where(cond)
            count_q = count_q.where(cond)
        total = (await db.execute(count_q)).scalar_one()
        rows = (
            (await db.execute(q.order_by(Tenant.created_at.desc()).offset((page - 1) * limit).limit(limit)))
            .scalars()
            .all()
        )
    return paginate([TenantOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(
    body: TenantCreateIn,
    request: Request,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> TenantOut:
    async with platform_session() as db:
        tenant = Tenant(
            name=body.name,
            slug=body.slug,
            plan_code=body.plan_code,
            contact_email=body.contact_email.lower(),
            settings=body.settings,
        )
        db.add(tenant)
        try:
            await db.flush()
        except Exception:
            raise conflict("Tenant slug is already taken") from None
        if body.owner_email and body.owner_password and body.owner_full_name:
            owner = TenantUser(
                tenant_id=tenant.id,
                email=body.owner_email.lower(),
                password_hash=hash_password(body.owner_password),
                full_name=body.owner_full_name,
                role="owner",
                status="active",
            )
            db.add(owner)
            try:
                await db.flush()
            except Exception:
                raise conflict("A user with the owner email already exists") from None
        await write_audit(
            db,
            tenant_id=tenant.id,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.tenant.created",
            resource_type="tenant",
            resource_id=str(tenant.id),
            ip=request.client.host if request.client else None,
        )
    return TenantOut.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: uuid.UUID) -> TenantOut:
    async with platform_session() as db:
        row = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if row is None:
        raise not_found("tenant", tenant_id) from None
    return TenantOut.model_validate(row)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdateIn,
    request: Request,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> TenantOut:
    async with platform_session() as db:
        row = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
        if row is None:
            raise not_found("tenant", tenant_id) from None
        changes = body.model_dump(exclude_unset=True)
        for k, v in changes.items():
            setattr(row, k, v)
        await write_audit(
            db,
            tenant_id=tenant_id,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.tenant.updated",
            resource_type="tenant",
            resource_id=str(tenant_id),
            details={"changes": list(changes.keys())},
            ip=request.client.host if request.client else None,
        )
        await db.flush()
        await db.refresh(row)
    return TenantOut.model_validate(row)


@router.get("/tenants/{tenant_id}/users", response_model=list)
async def list_tenant_users(tenant_id: uuid.UUID) -> list:
    async with platform_session() as db:
        rows = (await db.execute(select(TenantUser).where(TenantUser.tenant_id == tenant_id))).scalars().all()
    return [
        {
            "id": str(r.id),
            "email": r.email,
            "fullName": r.full_name,
            "role": r.role,
            "status": r.status,
            "mfaEnabled": r.mfa_enabled,
        }
        for r in rows
    ]


# ---------- platform admins ----------
@router.get("/admins", response_model=list[PlatformAdminOut])
async def list_admins() -> list[PlatformAdminOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(PlatformAdmin))).scalars().all()
    return [PlatformAdminOut.model_validate(r) for r in rows]


@router.post("/admins", response_model=PlatformAdminOut, status_code=201)
async def create_admin(
    body: PlatformAdminIn,
    auth: AuthContext = Depends(require_platform_admin((PlatformAdminRole.SUPER_ADMIN,))),
) -> PlatformAdminOut:
    async with platform_session() as db:
        row = PlatformAdmin(
            email=body.email.lower(),
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            role=body.role,
        )
        db.add(row)
        try:
            await db.flush()
        except Exception:
            raise conflict("An admin with this email already exists") from None
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.admin.created",
            resource_type="platform_admin",
            resource_id=str(row.id),
        )
    return PlatformAdminOut.model_validate(row)


# ---------- settings & feature flags ----------
@router.get("/settings", response_model=list[PlatformSettingOut])
async def list_settings() -> list[PlatformSettingOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(PlatformSetting))).scalars().all()
    return [PlatformSettingOut.model_validate(r) for r in rows]


@router.put("/settings/{key}", response_model=PlatformSettingOut)
async def put_setting(
    key: str,
    body: PlatformSettingIn,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> PlatformSettingOut:
    async with platform_session() as db:
        row = (
            await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        ).scalar_one_or_none()
        if row is None:
            row = PlatformSetting(key=key, value=body.value)
            db.add(row)
        else:
            row.value = body.value
        await db.flush()
        # onupdate expires updated_at post-flush; reload before the session closes.
        await db.refresh(row)
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.setting.updated",
            resource_type="platform_setting",
            resource_id=key,
        )
    return PlatformSettingOut.model_validate(row)


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
async def list_flags() -> list[FeatureFlagOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(FeatureFlag))).scalars().all()
    return [FeatureFlagOut.model_validate(r) for r in rows]


@router.put("/feature-flags/{key}", response_model=FeatureFlagOut)
async def put_flag(
    key: str,
    body: FeatureFlagIn,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> FeatureFlagOut:
    async with platform_session() as db:
        row = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
        if row is None:
            row = FeatureFlag(
                key=key,
                description=body.description,
                enabled=body.enabled,
                tenant_overrides=body.tenant_overrides,
            )
            db.add(row)
        else:
            row.description = body.description
            row.enabled = body.enabled
            row.tenant_overrides = body.tenant_overrides
        await db.flush()
        await db.refresh(row)
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.flag.updated",
            resource_type="feature_flag",
            resource_id=key,
            details={"enabled": body.enabled},
        )
    return FeatureFlagOut.model_validate(row)


# ---------- infrastructure & sessions ----------
@router.get("/infra/health")
async def infra_health() -> dict:
    return {"data": await infra_status()}


@router.get("/sessions", response_model=list[SessionOut])
async def list_all_sessions(
    user_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
    active_only: bool = True,
) -> list[SessionOut]:
    async with platform_session() as db:
        q = select(UserSession).order_by(UserSession.created_at.desc()).limit(500)
        if user_id:
            q = q.where(UserSession.user_id == user_id)
        if tenant_id:
            q = q.where(UserSession.tenant_id == tenant_id)
        if active_only:
            q = q.where(UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(timezone.utc))
        rows = (await db.execute(q)).scalars().all()
    return [SessionOut.model_validate(r) for r in rows]


@router.post("/sessions/{session_id}/revoke", response_model=MessageOut)
async def revoke_any_session(
    session_id: uuid.UUID,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.SUPPORT))
    ),
) -> MessageOut:
    async with platform_session() as db:
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.session.revoked",
            resource_type="user_session",
            resource_id=str(session_id),
        )
    return MessageOut(message="Session revoked")


@router.get("/audit-logs", response_model=Page[AuditLogOut])
async def list_platform_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
) -> Page[AuditLogOut]:
    cond = [AuditLog.actor_type == ActorType.PLATFORM_ADMIN]
    if action:
        cond.append(AuditLog.action.ilike(f"{action}%"))
    if actor_id:
        cond.append(AuditLog.actor_id == actor_id)
    if from_ts:
        cond.append(AuditLog.created_at >= from_ts)
    if to_ts:
        cond.append(AuditLog.created_at <= to_ts)
    async with platform_session() as db:
        total = (await db.execute(select(func.count()).select_from(AuditLog).where(*cond))).scalar_one()
        rows = (
            (
                await db.execute(
                    select(AuditLog)
                    .where(*cond)
                    .order_by(AuditLog.created_at.desc())
                    .offset((page - 1) * limit)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    return paginate([AuditLogOut.model_validate(r) for r in rows], total, page, limit)


# ---------- metrics ----------
@router.get("/metrics/overview", response_model=MetricsOverviewOut)
async def metrics_overview() -> MetricsOverviewOut:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    async with platform_session() as db:

        async def count(model, *conds) -> int:
            q = select(func.count()).select_from(model)
            if conds:
                q = q.where(*conds)
            return int((await db.execute(q)).scalar_one())

        tenants_total = await count(Tenant)
        tenants_active = await count(Tenant, Tenant.status == "active")
        users_total = await count(TenantUser)
        sessions_active = await count(
            UserSession,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        events_today = await count(AccessEvent, AccessEvent.occurred_at >= today)
        commands_today = await count(GateCommand, GateCommand.requested_at >= today)
        open_incidents = await count(BarrierIncident, BarrierIncident.status.in_(["open", "acknowledged"]))
        gates_total = await count(BarrierGate)
        edge_total = await count(EdgeDevice)
        edge_online = await count(EdgeDevice, EdgeDevice.status == "online")
    return MetricsOverviewOut(
        tenants_total=tenants_total,
        tenants_active=tenants_active,
        users_total=users_total,
        sessions_active=sessions_active,
        events_today=events_today,
        commands_today=commands_today,
        open_incidents=open_incidents,
        gates_total=gates_total,
        edge_devices_online=edge_online,
        edge_devices_total=edge_total,
    )


@router.get("/metrics/throughput-chart", response_model=ThroughputChartOut)
async def metrics_throughput_chart(
    hours: int = Query(24, ge=1, le=168),
) -> ThroughputChartOut:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    async with platform_session() as db:
        ev_bucket = func.date_trunc("hour", AccessEvent.occurred_at)
        ev_rows = (
            await db.execute(
                select(ev_bucket.label("hr"), func.count().label("n"))
                .where(AccessEvent.occurred_at >= since)
                .group_by("hr")
                .order_by("hr")
            )
        ).all()
        cmd_bucket = func.date_trunc("hour", GateCommand.requested_at)
        cmd_rows = (
            await db.execute(
                select(cmd_bucket.label("hr"), func.count().label("n"))
                .where(GateCommand.requested_at >= since)
                .group_by("hr")
                .order_by("hr")
            )
        ).all()
    points: dict[datetime, dict[str, int]] = {}
    for hr, n in ev_rows:
        points.setdefault(hr, {"events": 0, "commands": 0})["events"] = int(n)
    for hr, n in cmd_rows:
        points.setdefault(hr, {"events": 0, "commands": 0})["commands"] = int(n)
    return ThroughputChartOut(
        points=[ThroughputPoint(hour=hr.isoformat(), **slot) for hr, slot in sorted(points.items())]
    )


# ---------- monitoring ----------
@router.get("/monitoring/telemetry-snapshot", response_model=TelemetrySnapshotOut)
async def telemetry_snapshot() -> TelemetrySnapshotOut:
    """Latest telemetry per gate across all tenants (DISTINCT ON per gate)."""
    async with platform_session() as db:
        latest = (
            select(
                GateTelemetryLog.gate_id.label("gate_id"),
                GateTelemetryLog.state.label("state"),
                GateTelemetryLog.payload.label("payload"),
                GateTelemetryLog.recorded_at.label("recorded_at"),
            )
            .distinct(GateTelemetryLog.gate_id)
            .order_by(GateTelemetryLog.gate_id, GateTelemetryLog.recorded_at.desc())
            .subquery()
        )
        gate_rows = (
            await db.execute(
                select(
                    BarrierGate.id,
                    BarrierGate.tenant_id,
                    BarrierGate.site_id,
                    BarrierGate.name,
                    TenantSite.name.label("site_name"),
                    BarrierGate.status,
                    latest.c.state,
                    latest.c.payload,
                    latest.c.recorded_at,
                )
                .join(TenantSite, TenantSite.id == BarrierGate.site_id)
                .outerjoin(latest, latest.c.gate_id == BarrierGate.id)
                .order_by(BarrierGate.name)
            )
        ).all()
        device_rows = (
            await db.execute(
                select(
                    EdgeDevice.id,
                    EdgeDevice.tenant_id,
                    EdgeDevice.site_id,
                    EdgeDevice.name,
                    EdgeDevice.status,
                    EdgeDevice.last_heartbeat_at,
                ).order_by(EdgeDevice.name)
            )
        ).all()
    return TelemetrySnapshotOut(
        captured_at=datetime.now(timezone.utc),
        gates=[
            SnapshotGate(
                gate_id=r.id,
                tenant_id=r.tenant_id,
                site_id=r.site_id,
                gate_name=r.name,
                site_name=r.site_name,
                status=r.status,
                last_recorded_at=r.recorded_at,
                last_state=r.state,
                payload=r.payload,
            )
            for r in gate_rows
        ],
        devices=[
            SnapshotDevice(
                device_id=r.id,
                tenant_id=r.tenant_id,
                site_id=r.site_id,
                name=r.name,
                status=r.status,
                last_heartbeat_at=r.last_heartbeat_at,
            )
            for r in device_rows
        ],
    )


@router.post("/edge-devices/{device_id}/reboot", response_model=EdgeRebootOut)
async def reboot_edge_device(
    device_id: uuid.UUID,
    request: Request,
    auth: AuthContext = Depends(require_platform_admin()),
) -> EdgeRebootOut:
    """Issue `reboot` commands to every gate bound to this edge device."""
    async with platform_session() as db:
        device = (await db.execute(select(EdgeDevice).where(EdgeDevice.id == device_id))).scalar_one_or_none()
        if device is None:
            raise not_found("edge_device", device_id)
        gates = (
            (await db.execute(select(BarrierGate.id).where(BarrierGate.edge_device_id == device_id)))
            .scalars()
            .all()
        )
        command_ids: list[uuid.UUID] = []
        for gate_id in gates:
            row = await issue_command(
                db,
                tenant_id=device.tenant_id,
                gate_id=gate_id,
                command="reboot",
                idempotency_key=f"edge-reboot-{device_id}-{gate_id}-{uuid.uuid4().hex[:8]}",
                issued_by=auth.user_id,
                issued_by_type=auth.user_type,
                payload={"target": "edge_device", "deviceId": str(device_id)},
            )
            command_ids.append(row.id)
        if gates:
            await write_audit(
                db,
                tenant_id=device.tenant_id,
                actor_type=auth.user_type,
                actor_id=auth.user_id,
                actor_email=None,
                action="edge_device.reboot",
                resource_type="edge_device",
                resource_id=str(device_id),
                details={"gateCount": len(gates)},
                ip=request.client.host if request.client else None,
            )
        await db.commit()
    return EdgeRebootOut(command_ids=command_ids)
