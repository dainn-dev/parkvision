"""Platform security alert emission.

Auth flows call `emit_alert` when something suspicious is detected. Alerts
persist to `security_alerts` for the platform Security page; lifecycle
(acknowledge/resolve) is handled by the platform API. `emit_alert` never
raises — a broken alert must not fail the request that produced it.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import SecurityAlert

# Re-emitting an identical open alert every attempt would bury the feed —
# collapse repeats for the same subject within this window.
_DEDUP_WINDOW = timedelta(minutes=30)


async def emit_alert(
    db,
    *,
    type: str,
    severity: str,
    subject_email: str | None = None,
    subject_user_type: str | None = None,
    subject_user_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    evidence: dict | None = None,
) -> SecurityAlert | None:
    """Insert a security alert; dedupes open alerts per type+subject.

    Returns the new alert, or the existing open one when deduplicated.
    Caller is responsible for committing/flushing its session.
    """
    try:
        if subject_email:
            dup = await db.execute(
                select(func.count())
                .select_from(SecurityAlert)
                .where(
                    SecurityAlert.type == type,
                    SecurityAlert.subject_email == subject_email,
                    SecurityAlert.status == "OPEN",
                    SecurityAlert.detected_at
                    > datetime.now(timezone.utc) - _DEDUP_WINDOW,
                )
            )
            if dup.scalar_one() > 0:
                return None
        alert = SecurityAlert(
            type=type,
            severity=severity,
            status="OPEN",
            subject_email=subject_email,
            subject_user_type=subject_user_type,
            subject_user_id=subject_user_id,
            tenant_id=tenant_id,
            source_ip=ip,
            client_browser=(user_agent or "")[:300] or None,
            evidence=evidence or {},
        )
        db.add(alert)
        return alert
    except Exception:
        return None
