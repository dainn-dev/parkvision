//! Paid-exit grants (GAP-PAY-003). When a driver pays a parking session
//! online, the backend publishes on every gate's command topic:
//!
//! ```json
//! {"type":"paid_exit_grant","sessionId":"<uuid>","paymentId":"<uuid>",
//!  "plateNumber":"<raw>","plateNormalized":"<normalized>",
//!  "paidAt":"<rfc3339>","expiresAt":"<rfc3339>"}
//! ```
//!
//! The grant is kept in `edge.db` (`exit_grants`) so the exit lane can open
//! for that plate once — even if the network drops right after payment.
//! `access::decide_access` consumes it. Like `walk_in_paid`, this is a
//! signal, not a barrier command: no `GateCommand` row, no ack.

use chrono::{DateTime, Utc};
use serde_json::Value;
use tracing::{info, warn};
use uuid::Uuid;

use crate::store::{ExitGrant, Store};

/// What handling one `paid_exit_grant` signal did.
#[derive(Debug, PartialEq, Eq)]
pub enum GrantOutcome {
    /// New grant stored.
    Stored,
    /// Same `paymentId` already held (one signal per gate topic) or the
    /// grant had already expired — nothing changed.
    Ignored,
    /// Required fields missing or unparseable.
    Malformed,
}

fn parse_ts(v: Option<&Value>) -> Option<DateTime<Utc>> {
    v.and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
}

fn parse_uuid(v: Option<&Value>) -> Option<Uuid> {
    v.and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok())
}

/// Parse the wire message. `paymentId`, `expiresAt` and at least one of
/// `plateNumber` / `plateNormalized` are required.
pub fn parse_signal(body: &Value) -> Option<ExitGrant> {
    let payment_id = parse_uuid(body.get("paymentId"))?;
    let expires_at = parse_ts(body.get("expiresAt"))?;
    let plate_number = body
        .get("plateNumber")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let plate_normalized = body
        .get("plateNormalized")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if plate_number.trim().is_empty() && plate_normalized.trim().is_empty() {
        return None;
    }
    Some(ExitGrant {
        payment_id,
        session_id: parse_uuid(body.get("sessionId")),
        plate_number,
        plate_normalized,
        paid_at: parse_ts(body.get("paidAt")),
        expires_at,
    })
}

/// Store a `paid_exit_grant` signal. Idempotent per `paymentId`.
pub fn on_signal(store: &Store, body: &Value, now: DateTime<Utc>) -> GrantOutcome {
    let Some(grant) = parse_signal(body) else {
        warn!("malformed paid_exit_grant signal dropped");
        return GrantOutcome::Malformed;
    };
    match store.insert_exit_grant(&grant, now) {
        Ok(true) => {
            info!(payment = %grant.payment_id, "paid-exit grant stored");
            GrantOutcome::Stored
        }
        Ok(false) => GrantOutcome::Ignored,
        Err(e) => {
            warn!("paid-exit grant not stored: {e:#}");
            GrantOutcome::Malformed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use serde_json::json;

    fn temp_store() -> (Store, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (Store::open(&dir.path().join("edge.db")).unwrap(), dir)
    }

    fn signal(payment: Uuid, expires_at: DateTime<Utc>) -> Value {
        json!({
            "type": "paid_exit_grant",
            "sessionId": Uuid::new_v4(),
            "paymentId": payment,
            "plateNumber": "51A-999.99",
            "plateNormalized": "51A99999",
            "paidAt": Utc::now().to_rfc3339(),
            "expiresAt": expires_at.to_rfc3339(),
        })
    }

    #[test]
    fn parses_exact_backend_shape() {
        let pid = Uuid::new_v4();
        let g = parse_signal(&signal(pid, Utc::now() + Duration::minutes(15))).unwrap();
        assert_eq!(g.payment_id, pid);
        assert_eq!(g.plate_number, "51A-999.99");
        assert_eq!(g.plate_normalized, "51A99999");
        assert!(g.session_id.is_some());
        assert!(g.paid_at.is_some());
    }

    #[test]
    fn duplicate_signal_is_idempotent() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        let pid = Uuid::new_v4();
        let body = signal(pid, now + Duration::minutes(15));
        assert_eq!(on_signal(&store, &body, now), GrantOutcome::Stored);
        // second gate topic delivers the same message
        assert_eq!(on_signal(&store, &body, now), GrantOutcome::Ignored);
        assert!(store.consume_exit_grant(pid, now).unwrap());
        // a QoS-1 redelivery after use must not re-arm the grant
        assert_eq!(on_signal(&store, &body, now), GrantOutcome::Ignored);
        assert_eq!(store.find_exit_grant("51A99999", now).unwrap(), None);
    }

    #[test]
    fn already_expired_signal_is_ignored() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        let body = signal(Uuid::new_v4(), now - Duration::minutes(1));
        assert_eq!(on_signal(&store, &body, now), GrantOutcome::Ignored);
        assert_eq!(store.find_exit_grant("51A99999", now).unwrap(), None);
    }

    #[test]
    fn malformed_signal_is_rejected() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        assert_eq!(
            on_signal(&store, &json!({"type": "paid_exit_grant"}), now),
            GrantOutcome::Malformed
        );
        let mut no_plate = signal(Uuid::new_v4(), now + Duration::minutes(5));
        no_plate["plateNumber"] = json!("");
        no_plate["plateNormalized"] = json!("");
        assert_eq!(on_signal(&store, &no_plate, now), GrantOutcome::Malformed);
    }
}
