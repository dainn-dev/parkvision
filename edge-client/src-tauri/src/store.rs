//! SQLite local store — offline whitelist/rules cache, durable outbox,
//! command dedup, key/value state. One `Mutex<Connection>`; volume is low
//! (whitelist sync + ~1 event/vehicle pass), no pool needed.

use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::commands::CommandLog;

const MAX_OUTBOX: u64 = 10_000;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS whitelist (
    plate_normalized TEXT PRIMARY KEY,
    tag              TEXT NOT NULL,
    valid_from       TEXT,
    valid_to         TEXT,
    status           TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
    id          TEXT PRIMARY KEY,
    site_id     TEXT,
    name        TEXT NOT NULL,
    rule_type   TEXT NOT NULL,
    priority    INTEGER NOT NULL,
    schedule    TEXT NOT NULL,
    conditions  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS processed_commands (
    command_id   TEXT PRIMARY KEY,
    success      INTEGER NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS local_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_normalized TEXT NOT NULL,
    direction        TEXT NOT NULL,
    decision         TEXT NOT NULL,
    occurred_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

#[derive(Clone, Debug)]
pub struct VehicleRow {
    pub plate_normalized: String,
    pub tag: String,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_to: Option<DateTime<Utc>>,
    pub status: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct RuleRow {
    pub id: Uuid,
    pub site_id: Option<Uuid>,
    pub name: String,
    pub rule_type: String,
    pub priority: i32,
    pub schedule: serde_json::Value,
    pub conditions: serde_json::Value,
}

fn dt_s(dt: &DateTime<Utc>) -> String {
    dt.to_rfc3339()
}

fn parse_dt(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .ok()
}

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn =
            Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
        conn.execute_batch(SCHEMA)?;
        // WAL + NORMAL fsyncs at commit-boundaries only — durable across app
        // crashes, fast enough for burst outbox writes.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn upsert_vehicle(&self, v: &VehicleRow) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO whitelist (plate_normalized, tag, valid_from, valid_to, status, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(plate_normalized) DO UPDATE SET
               tag=excluded.tag, valid_from=excluded.valid_from,
               valid_to=excluded.valid_to, status=excluded.status,
               updated_at=excluded.updated_at",
            params![
                v.plate_normalized,
                v.tag,
                v.valid_from.as_ref().map(dt_s),
                v.valid_to.as_ref().map(dt_s),
                v.status,
                dt_s(&v.updated_at),
            ],
        )?;
        Ok(())
    }

    pub fn vehicle(&self, plate_normalized: &str) -> Result<Option<VehicleRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT plate_normalized, tag, valid_from, valid_to, status, updated_at
             FROM whitelist WHERE plate_normalized = ?1",
        )?;
        let mut rows = stmt.query_map(params![plate_normalized], |r| {
            Ok(VehicleRow {
                plate_normalized: r.get(0)?,
                tag: r.get(1)?,
                valid_from: r.get::<_, Option<String>>(2)?.and_then(|s| parse_dt(&s)),
                valid_to: r.get::<_, Option<String>>(3)?.and_then(|s| parse_dt(&s)),
                status: r.get(4)?,
                updated_at: parse_dt(&r.get::<_, String>(5)?).unwrap_or_else(Utc::now),
            })
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    /// Full refresh — the sync endpoint is authoritative, so replace all.
    pub fn replace_rules(&self, rules: &[RuleRow]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM rules", [])?;
        for r in rules {
            tx.execute(
                "INSERT INTO rules (id, site_id, name, rule_type, priority, schedule, conditions)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    r.id.to_string(),
                    r.site_id.map(|u| u.to_string()),
                    r.name,
                    r.rule_type,
                    r.priority,
                    r.schedule.to_string(),
                    r.conditions.to_string(),
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn rules(&self) -> Result<Vec<RuleRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, site_id, name, rule_type, priority, schedule, conditions FROM rules",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(RuleRow {
                id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::nil()),
                site_id: r
                    .get::<_, Option<String>>(1)?
                    .and_then(|s| Uuid::parse_str(&s).ok()),
                name: r.get(2)?,
                rule_type: r.get(3)?,
                priority: r.get(4)?,
                schedule: serde_json::from_str(&r.get::<_, String>(5)?)
                    .unwrap_or(serde_json::Value::Null),
                conditions: serde_json::from_str(&r.get::<_, String>(6)?)
                    .unwrap_or(serde_json::Value::Null),
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| {
            r.get(0)
        }) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn whitelist_count(&self) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row("SELECT COUNT(*) FROM whitelist", [], |r| r.get::<_, i64>(0))? as u64)
    }

    pub fn pending_count(&self) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row("SELECT COUNT(*) FROM pending_events", [], |r| r.get::<_, i64>(0))? as u64)
    }

    pub fn kv_set(&self, key: &str, value: &str) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO kv (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Durable outbox enqueue — capped at MAX_OUTBOX, oldest evicted first.
    pub fn enqueue_event(&self, kind: &str, body: serde_json::Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO pending_events (kind, body) VALUES (?1, ?2)",
            params![kind, body.to_string()],
        )?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pending_events", [], |r| r.get(0))?;
        if count > MAX_OUTBOX as i64 {
            // drop everything older than the newest MAX_OUTBOX rows
            conn.execute(
                "DELETE FROM pending_events WHERE id <=
                   (SELECT id FROM pending_events ORDER BY id DESC
                    LIMIT 1 OFFSET ?1)",
                params![MAX_OUTBOX as i64],
            )?;
        }
        Ok(())
    }

    /// Unacked events in FIFO order (call `ack_event` on success).
    pub fn drain_events(&self, limit: u32) -> Result<Vec<(i64, String, serde_json::Value)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, kind, body FROM pending_events ORDER BY id ASC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or(serde_json::Value::Null),
            ))
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn ack_event(&self, row_id: i64) -> Result<()> {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM pending_events WHERE id = ?1", params![row_id])?;
        Ok(())
    }

    /// Mirror of backend anti-passback input — local access events feed
    /// `decide_access` while offline.
    pub fn record_local_event(&self, plate: &str, direction: &str, decision: &str) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO local_events (plate_normalized, direction, decision, occurred_at) VALUES (?1, ?2, ?3, ?4)",
            params![plate, direction, decision, dt_s(&Utc::now())],
        )?;
        Ok(())
    }

    /// Latest event for this plate (any direction) — anti-passback compares
    /// direction against it. Returns (direction, decision).
    pub fn last_local_event(
        &self,
        plate: &str,
        _direction: &str,
    ) -> Result<Option<(String, String, DateTime<Utc>)>> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row(
            "SELECT direction, decision, occurred_at FROM local_events
             WHERE plate_normalized = ?1 ORDER BY id DESC LIMIT 1",
            params![plate],
            |r| {
                let raw: String = r.get(2)?;
                let ts = parse_dt(&raw)
                    .or_else(|| {
                        chrono::NaiveDateTime::parse_from_str(&raw, "%Y-%m-%d %H:%M:%S")
                            .ok()
                            .map(|n| n.and_utc())
                    })
                    .unwrap_or_else(Utc::now);
                Ok((r.get(0)?, r.get(1)?, ts))
            },
        ) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}

impl CommandLog for Store {
    fn seen(&self, id: Uuid) -> Option<bool> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row(
            "SELECT success FROM processed_commands WHERE command_id = ?1",
            params![id.to_string()],
            |r| r.get::<_, i64>(0),
        ) {
            Ok(v) => Some(v != 0),
            Err(_) => None,
        }
    }

    fn record(&self, id: Uuid, success: bool) {
        let _ = self.conn.lock().unwrap().execute(
            "INSERT OR REPLACE INTO processed_commands (command_id, success) VALUES (?1, ?2)",
            params![id.to_string(), success as i64],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::CommandLog;
    use serde_json::json;
    use uuid::Uuid;

    fn temp_store() -> (Store, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join("edge.db")).unwrap();
        (store, dir)
    }

    #[test]
    fn vehicle_upsert_and_read_back() {
        let (store, _d) = temp_store();
        let v = VehicleRow {
            plate_normalized: "30E89241".into(),
            tag: "resident".into(),
            valid_from: Some(chrono::Utc::now()),
            valid_to: None,
            status: "active".into(),
            updated_at: chrono::Utc::now(),
        };
        store.upsert_vehicle(&v).unwrap();
        let got = store.vehicle("30E89241").unwrap().unwrap();
        assert_eq!(got.tag, "resident");
        assert!(got.valid_from.is_some());
        assert!(got.valid_to.is_none());
        assert_eq!(got.status, "active");
        assert!(store.vehicle("ZZZ999").unwrap().is_none());

        // upsert overwrites
        let v2 = VehicleRow {
            status: "suspended".into(),
            ..v
        };
        store.upsert_vehicle(&v2).unwrap();
        assert_eq!(
            store.vehicle("30E89241").unwrap().unwrap().status,
            "suspended"
        );
    }

    #[test]
    fn replace_rules_wipes_and_inserts() {
        let (store, _d) = temp_store();
        let r = |name: &str, pri: i32| RuleRow {
            id: Uuid::new_v4(),
            site_id: None,
            name: name.into(),
            rule_type: "allow".into(),
            priority: pri,
            schedule: json!({}),
            conditions: json!({}),
        };
        store.replace_rules(&[r("a", 1), r("b", 2)]).unwrap();
        assert_eq!(store.rules().unwrap().len(), 2);
        store.replace_rules(&[r("c", 3)]).unwrap();
        let rules = store.rules().unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].name, "c");
    }

    #[test]
    fn outbox_enqueue_drain_ack_lifecycle() {
        let (store, _d) = temp_store();
        store
            .enqueue_event("access", json!({"plate": "A"}))
            .unwrap();
        store
            .enqueue_event("incident", json!({"kind": "fault"}))
            .unwrap();
        let rows = store.drain_events(10).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].1, "access");
        assert_eq!(rows[0].2["plate"], "A");
        assert!(rows[0].0 < rows[1].0, "ordered by id");
        store.ack_event(rows[0].0).unwrap();
        let remaining = store.drain_events(10).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].1, "incident");
    }

    #[test]
    fn command_dedup_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("edge.db");
        let id = Uuid::new_v4();
        {
            let store = Store::open(&path).unwrap();
            assert!(store.seen(id).is_none());
            store.record(id, true);
        }
        let store = Store::open(&path).unwrap();
        assert_eq!(store.seen(id), Some(true));
    }

    #[test]
    fn outbox_evicts_oldest_beyond_cap() {
        let (store, _d) = temp_store();
        for i in 0..MAX_OUTBOX + 5 {
            store.enqueue_event("access", json!({"i": i})).unwrap();
        }
        let rows = store.drain_events(u32::MAX).unwrap();
        assert_eq!(rows.len() as u64, MAX_OUTBOX);
        // the 5 oldest were evicted — smallest surviving body is i=5
        let min = rows
            .iter()
            .map(|r| r.2["i"].as_u64().unwrap())
            .min()
            .unwrap();
        assert_eq!(min, 5);
    }

    #[test]
    fn kv_round_trip() {
        let (store, _d) = temp_store();
        assert!(store.kv_get("whitelist_synced_at").unwrap().is_none());
        store
            .kv_set("whitelist_synced_at", "2026-09-28T00:00:00Z")
            .unwrap();
        assert_eq!(
            store.kv_get("whitelist_synced_at").unwrap().unwrap(),
            "2026-09-28T00:00:00Z"
        );
    }

    #[test]
    fn local_events_record_and_lookup_for_antipassback() {
        let (store, _d) = temp_store();
        store
            .record_local_event("30E89241", "entry", "allow")
            .unwrap();
        let last = store
            .last_local_event("30E89241", "entry")
            .unwrap()
            .unwrap();
        assert_eq!(last.0, "entry");
        assert_eq!(last.1, "allow");
        assert!(store.last_local_event("NONE", "entry").unwrap().is_none());
    }
}
