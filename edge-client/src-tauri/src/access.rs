//! Offline mirror of `backend/app/services/event_service.py::decide_access`.
//! Step-for-step: plate normalization → registered-vehicle checks → rules in
//! ascending priority (deny_list / allow_list with schedule + conditions) →
//! anti-passback on allow outcomes. Reads come from the synced SQLite tables;
//! `record_local_event` is the local analogue of `access_events`.

use chrono::{DateTime, Datelike, Timelike, Utc};

use crate::store::{RuleRow, Store};

/// Same regex as backend: `re.sub(r"[^A-Z0-9]", "", plate.upper())`.
pub fn normalize_plate(plate: &str) -> String {
    plate
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

#[derive(Debug)]
pub struct AccessOutcome {
    pub decision: String, // "allow" | "deny"
    pub reason: String,
}

fn schedule_open(schedule: &serde_json::Value, now: &DateTime<Utc>) -> bool {
    let obj = match schedule.as_object() {
        Some(o) if !o.is_empty() => o,
        _ => return true,
    };
    if let Some(days) = obj.get("daysOfWeek").and_then(|d| d.as_array()) {
        // backend: now.isoweekday() in days — 1=Mon..7=Sun
        let iso = now.weekday().num_days_from_monday() as i64 + 1;
        if !days.iter().any(|d| d.as_i64() == Some(iso)) {
            return false;
        }
    }
    let (start, end) = (
        obj.get("startTime").and_then(|v| v.as_str()),
        obj.get("endTime").and_then(|v| v.as_str()),
    );
    if let (Some(s), Some(e)) = (start, end) {
        // backend compares "HH:MM" strings on the UTC clock
        let t = format!("{:02}:{:02}", now.hour(), now.minute());
        if !(s <= t.as_str() && t.as_str() <= e) {
            return false;
        }
    }
    true
}

/// Mirror of `_final` — anti-passback gate on allow outcomes.
/// Settings come from kv: `anti_passback_enabled` ("false" disables) and
/// `anti_passback_window_minutes` (default 5, <=0 disables).
fn apply_anti_passback(
    store: &Store,
    normalized: &str,
    direction: &str,
    decision: String,
    reason: String,
    now: &DateTime<Utc>,
) -> AccessOutcome {
    if decision != "allow" || !matches!(direction, "entry" | "exit") {
        return AccessOutcome { decision, reason };
    }
    if store
        .kv_get("anti_passback_enabled")
        .ok()
        .flatten()
        .as_deref()
        == Some("false")
    {
        return AccessOutcome { decision, reason };
    }
    let window: i64 = store
        .kv_get("anti_passback_window_minutes")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);
    if window <= 0 {
        return AccessOutcome { decision, reason };
    }
    if let Ok(Some((last_dir, last_dec, last_at))) = store.last_local_event(normalized, direction) {
        if last_dec == "allow"
            && last_dir == direction
            && (*now - last_at).num_seconds() < window * 60
        {
            return AccessOutcome {
                decision: "deny".to_string(),
                reason: "anti_passback".to_string(),
            };
        }
    }
    AccessOutcome { decision, reason }
}

/// `decide_access(store, plate, direction, now)` → outcome.
/// `direction` is "entry" | "exit" (anything else skips anti-passback, same
/// as backend's non-entry/exit directions).
pub fn decide_access(
    store: &Store,
    plate: Option<&str>,
    direction: &str,
    now: DateTime<Utc>,
) -> AccessOutcome {
    let plate_number = match plate {
        Some(p) if !p.is_empty() => p,
        _ => {
            return AccessOutcome {
                decision: "deny".to_string(),
                reason: "no_plate_detected".to_string(),
            }
        }
    };
    let normalized = normalize_plate(plate_number);
    let vehicle = store.vehicle(&normalized).ok().flatten();
    let rules = store.rules().unwrap_or_default();

    let (base_decision, base_reason) = match &vehicle {
        None => ("deny", "plate_not_registered"),
        Some(v) if v.tag == "blacklist" => ("deny", "vehicle_blacklisted"),
        Some(v) if v.status != "active" => ("deny", "vehicle_suspended"),
        Some(v) if v.valid_from.map(|f| f > now).unwrap_or(false) => {
            ("deny", "vehicle_not_yet_valid")
        }
        Some(v) if v.valid_to.map(|t| t < now).unwrap_or(false) => ("deny", "vehicle_expired"),
        Some(_) => ("allow", "vehicle_registered"),
    };

    let mut sorted: Vec<&RuleRow> = rules.iter().collect();
    sorted.sort_by_key(|r| r.priority);
    for rule in sorted {
        // conditions.tags | conditions.plates scoping
        let applies: Vec<String> = rule
            .conditions
            .get("tags")
            .or_else(|| rule.conditions.get("plates"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        if !applies.is_empty() {
            let tag_hit = vehicle
                .as_ref()
                .map(|v| applies.contains(&v.tag))
                .unwrap_or(false);
            let plate_hit = applies.iter().any(|p| normalize_plate(p) == normalized);
            if !(tag_hit || plate_hit) {
                continue;
            }
        }
        if !schedule_open(&rule.schedule, &now) {
            continue;
        }
        match rule.rule_type.as_str() {
            "deny_list" => {
                return AccessOutcome {
                    decision: "deny".to_string(),
                    reason: format!("rule:{}", rule.name),
                }
            }
            "allow_list" => {
                return apply_anti_passback(
                    store,
                    &normalized,
                    direction,
                    "allow".to_string(),
                    format!("rule:{}", rule.name),
                    &now,
                );
            }
            _ => {}
        }
    }

    apply_anti_passback(
        store,
        &normalized,
        direction,
        base_decision.to_string(),
        base_reason.to_string(),
        &now,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{RuleRow, Store, VehicleRow};
    use chrono::Duration;
    use serde_json::json;
    use uuid::Uuid;

    const NOW: &str = "2026-09-28T08:30:00Z"; // a Monday

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(NOW)
            .unwrap()
            .with_timezone(&Utc)
    }

    fn temp_store() -> (Store, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (Store::open(&dir.path().join("edge.db")).unwrap(), dir)
    }

    fn vehicle(tag: &str, status: &str) -> VehicleRow {
        VehicleRow {
            plate_normalized: "30E89241".into(),
            tag: tag.into(),
            valid_from: Some(now() - Duration::days(30)),
            valid_to: Some(now() + Duration::days(365)),
            status: status.into(),
            updated_at: now(),
        }
    }

    fn rule(
        name: &str,
        rule_type: &str,
        priority: i32,
        conditions: serde_json::Value,
        schedule: serde_json::Value,
    ) -> RuleRow {
        RuleRow {
            id: Uuid::new_v4(),
            site_id: None,
            name: name.into(),
            rule_type: rule_type.into(),
            priority,
            schedule,
            conditions,
        }
    }

    #[test]
    fn normalize_strips_non_alnum_and_uppercases() {
        assert_eq!(normalize_plate("30E-892.41"), "30E89241");
        assert_eq!(normalize_plate(" 59a-123.45 "), "59A12345");
    }

    #[test]
    fn unregistered_plate_denied() {
        let (store, _d) = temp_store();
        let out = decide_access(&store, Some("ZZZ999"), "entry", now());
        assert_eq!(out.decision, "deny");
        assert_eq!(out.reason, "plate_not_registered");
    }

    #[test]
    fn no_plate_denied() {
        let (store, _d) = temp_store();
        let out = decide_access(&store, None, "entry", now());
        assert_eq!(out.decision, "deny");
        assert_eq!(out.reason, "no_plate_detected");
    }

    #[test]
    fn registered_active_allowed() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        let out = decide_access(&store, Some("30E-892.41"), "entry", now());
        assert_eq!(out.decision, "allow");
        assert_eq!(out.reason, "vehicle_registered");
    }

    #[test]
    fn blacklist_suspended_expired_notyet_denied() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("blacklist", "active"))
            .unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).reason,
            "vehicle_blacklisted"
        );

        store
            .upsert_vehicle(&vehicle("resident", "suspended"))
            .unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).reason,
            "vehicle_suspended"
        );

        let mut v = vehicle("resident", "active");
        v.valid_to = Some(now() - Duration::days(1));
        store.upsert_vehicle(&v).unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).reason,
            "vehicle_expired"
        );

        v.valid_to = None;
        v.valid_from = Some(now() + Duration::days(1));
        store.upsert_vehicle(&v).unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).reason,
            "vehicle_not_yet_valid"
        );
    }

    #[test]
    fn deny_list_rule_overrides_registered_vehicle() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        store
            .replace_rules(&[rule(
                "After-hours ban",
                "deny_list",
                1,
                json!({"tags": ["resident"]}),
                json!({}),
            )])
            .unwrap();
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(out.decision, "deny");
        assert_eq!(out.reason, "rule:After-hours ban");
    }

    #[test]
    fn allow_list_rule_grants() {
        let (store, _d) = temp_store();
        store.upsert_vehicle(&vehicle("vip", "active")).unwrap();
        store
            .replace_rules(&[rule(
                "VIP fastlane",
                "allow_list",
                1,
                json!({"tags": ["vip"]}),
                json!({}),
            )])
            .unwrap();
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(out.decision, "allow");
        assert_eq!(out.reason, "rule:VIP fastlane");
    }

    #[test]
    fn closed_schedule_rule_is_skipped() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        // NOW is Monday (isoweekday 1); rule only applies Sunday (7)
        let sched = json!({"daysOfWeek": [7]});
        store
            .replace_rules(&[rule(
                "Sunday only",
                "deny_list",
                1,
                json!({"tags": ["resident"]}),
                sched,
            )])
            .unwrap();
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(
            out.decision, "allow",
            "rule must be skipped outside its schedule"
        );
        assert_eq!(out.reason, "vehicle_registered");
    }

    #[test]
    fn schedule_time_window_enforced() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        // NOW is 08:30 — rule window 09:00-17:00 is closed
        let sched = json!({"startTime": "09:00", "endTime": "17:00"});
        store
            .replace_rules(&[rule(
                "Daytime ban",
                "deny_list",
                1,
                json!({"tags": ["resident"]}),
                sched,
            )])
            .unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).decision,
            "allow"
        );
        // window covering 08:30 applies
        let sched2 = json!({"startTime": "08:00", "endTime": "09:00"});
        store
            .replace_rules(&[rule(
                "Daytime ban",
                "deny_list",
                1,
                json!({"tags": ["resident"]}),
                sched2,
            )])
            .unwrap();
        assert_eq!(
            decide_access(&store, Some("30E89241"), "entry", now()).decision,
            "deny"
        );
    }

    #[test]
    fn anti_passback_denies_repeat_same_direction() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(out.decision, "allow");
        store
            .record_local_event("30E89241", "entry", "allow")
            .unwrap();
        // immediate second entry → anti-passback deny
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(out.decision, "deny");
        assert_eq!(out.reason, "anti_passback");
        // exit is a different direction → unaffected
        let out = decide_access(&store, Some("30E89241"), "exit", now());
        assert_eq!(out.decision, "allow");
    }

    #[test]
    fn anti_passback_disabled_when_window_zero() {
        let (store, _d) = temp_store();
        store
            .upsert_vehicle(&vehicle("resident", "active"))
            .unwrap();
        store.kv_set("anti_passback_window_minutes", "0").unwrap();
        store
            .record_local_event("30E89241", "entry", "allow")
            .unwrap();
        let out = decide_access(&store, Some("30E89241"), "entry", now());
        assert_eq!(out.decision, "allow");
    }
}
