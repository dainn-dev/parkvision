//! SQLite local store — offline whitelist/rules cache, durable outbox,
//! command dedup, key/value state. One `Mutex<Connection>`; volume is low
//! (whitelist sync + ~1 event/vehicle pass), no pool needed.

use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tracing::warn;
use uuid::Uuid;

use crate::commands::CommandLog;

const MAX_OUTBOX: u64 = 10_000;

/// `kv` key backing the cumulative outbox-eviction counter — survives
/// restarts so operators can see loss even after the app cycles.
const OUTBOX_DROPPED_KEY: &str = "outbox_dropped_count";

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
CREATE TABLE IF NOT EXISTS walk_in_sessions (
    session_id       TEXT PRIMARY KEY,
    plate_normalized TEXT NOT NULL,
    plate_number     TEXT NOT NULL,
    entry_gate_id    TEXT,
    entered_at       TEXT NOT NULL,
    entry_image_key  TEXT,
    status           TEXT NOT NULL DEFAULT 'open',
    exit_gate_id     TEXT,
    exited_at        TEXT,
    amount_vnd       INTEGER,
    method           TEXT,
    confirmed_by     TEXT,
    waive_reason     TEXT,
    bank_ref         TEXT
);
CREATE INDEX IF NOT EXISTS idx_walk_in_plate_status
    ON walk_in_sessions (plate_normalized, status);
-- Paid-exit grants pushed by the backend (`paid_exit_grant` signal) so an
-- exit lane can honour a driver's online payment while offline. One row per
-- payment; `used_at` set once the barrier was opened for it.
CREATE TABLE IF NOT EXISTS exit_grants (
    payment_id       TEXT PRIMARY KEY,
    session_id       TEXT,
    plate_number     TEXT NOT NULL,
    plate_normalized TEXT NOT NULL,
    plate_local      TEXT NOT NULL,
    paid_at          TEXT,
    expires_at       TEXT NOT NULL,
    used_at          TEXT,
    received_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exit_grants_plate ON exit_grants (plate_normalized);
CREATE INDEX IF NOT EXISTS idx_exit_grants_plate_local ON exit_grants (plate_local);
";

/// `kv` key holding the tenant whose data this `edge.db` contains.
pub const BOUND_TENANT_KEY: &str = "bound_tenant_id";

/// Tables holding tenant-owned data — wiped when the device is re-activated
/// for a different tenant. `kv` is handled separately.
const TENANT_TABLES: &[&str] = &[
    "whitelist",
    "rules",
    "local_events",
    "pending_events",
    "walk_in_sessions",
    "exit_grants",
    "processed_commands",
];

/// `kv` keys that describe the database itself, not a tenant — kept on wipe.
const KV_KEEP_ON_WIPE: &[&str] = &["schema_version"];

/// A backend-issued paid-exit grant (one per payment).
#[derive(Clone, Debug, PartialEq)]
pub struct ExitGrant {
    pub payment_id: Uuid,
    pub session_id: Option<Uuid>,
    pub plate_number: String,
    pub plate_normalized: String,
    pub paid_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
}

/// Rows removed by one retention pass.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RetentionPruned {
    pub local_events: u64,
    pub walk_ins: u64,
    pub exit_grants: u64,
}

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

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankAccount {
    pub bin: String,
    pub account_number: String,
    pub account_name: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredPricing {
    pub pricing: crate::pricing::SitePricing,
    pub timezone: String,
    pub bank_account: Option<BankAccount>,
    /// Absent in values stored by older builds.
    #[serde(default)]
    pub site_name: Option<String>,
    pub updated_at: String,
}

/// One walk-in visit on this device. `status` is `open` until settled, then
/// `paid` or `waived`.
#[derive(Clone, Debug, PartialEq)]
pub struct WalkInRow {
    pub session_id: Uuid,
    pub plate_normalized: String,
    pub plate_number: String,
    pub entry_gate_id: Option<Uuid>,
    pub entered_at: DateTime<Utc>,
    pub entry_image_key: Option<String>,
    pub status: String,
    pub exit_gate_id: Option<Uuid>,
    pub exited_at: Option<DateTime<Utc>>,
    pub amount_vnd: Option<i64>,
    pub method: Option<String>,
    pub confirmed_by: Option<String>,
    pub waive_reason: Option<String>,
    pub bank_ref: Option<String>,
}

/// How a walk-in visit was settled (`method`: cash | bank_qr | waived,
/// `confirmed_by`: manual | auto).
#[derive(Clone, Debug, PartialEq)]
pub struct Settlement {
    pub method: String,
    pub confirmed_by: String,
    pub waive_reason: Option<String>,
    pub bank_ref: Option<String>,
}

/// Totals of settled walk-ins since a point in time.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkInSummary {
    pub cash_count: u64,
    pub cash_total_vnd: i64,
    pub bank_qr_count: u64,
    pub bank_qr_total_vnd: i64,
    pub waived_count: u64,
}

/// Fixed-width UTC timestamp so TEXT comparison orders correctly.
fn ts(dt: &DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

const WALK_IN_COLS: &str = "session_id, plate_normalized, plate_number, entry_gate_id, \
    entered_at, entry_image_key, status, exit_gate_id, exited_at, amount_vnd, method, \
    confirmed_by, waive_reason, bank_ref";

fn walk_in_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<WalkInRow> {
    let uuid = |i: usize| -> rusqlite::Result<Option<Uuid>> {
        Ok(r.get::<_, Option<String>>(i)?
            .and_then(|s| Uuid::parse_str(&s).ok()))
    };
    Ok(WalkInRow {
        session_id: uuid(0)?.unwrap_or_else(Uuid::nil),
        plate_normalized: r.get(1)?,
        plate_number: r.get(2)?,
        entry_gate_id: uuid(3)?,
        entered_at: parse_dt(&r.get::<_, String>(4)?).unwrap_or_else(Utc::now),
        entry_image_key: r.get(5)?,
        status: r.get(6)?,
        exit_gate_id: uuid(7)?,
        exited_at: r.get::<_, Option<String>>(8)?.and_then(|s| parse_dt(&s)),
        amount_vnd: r.get(9)?,
        method: r.get(10)?,
        confirmed_by: r.get(11)?,
        waive_reason: r.get(12)?,
        bank_ref: r.get(13)?,
    })
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

    /// Full-sync reconciliation — drop whitelist rows whose plate is not in
    /// `keep`, so vehicles removed backend-side stop opening the gate.
    /// Returns the number of rows deleted. Temp table sidesteps the SQLite
    /// bound-parameter limit for large whitelists.
    pub fn delete_vehicles_not_in(&self, keep: &std::collections::HashSet<String>) -> Result<u64> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS keep_plate (plate TEXT PRIMARY KEY);
             DELETE FROM keep_plate;",
        )?;
        {
            let mut stmt = tx.prepare("INSERT OR IGNORE INTO keep_plate (plate) VALUES (?1)")?;
            for plate in keep {
                stmt.execute(params![plate])?;
            }
        }
        let purged = tx.execute(
            "DELETE FROM whitelist WHERE plate_normalized NOT IN (SELECT plate FROM keep_plate)",
            [],
        )? as u64;
        tx.execute("DROP TABLE keep_plate", [])?;
        tx.commit()?;
        Ok(purged)
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

    pub fn put_site_pricing(&self, pricing: &StoredPricing) -> Result<()> {
        let value = serde_json::to_string(pricing).context("serialize site pricing")?;
        self.kv_set("site_pricing", &value)
    }

    pub fn site_pricing(&self) -> Result<Option<StoredPricing>> {
        match self.kv_get("site_pricing")? {
            Some(value) => Ok(Some(serde_json::from_str(&value).context("deserialize site pricing")?)),
            None => Ok(None),
        }
    }

    /// Insert a walk-in session; an existing `session_id` is left untouched.
    pub fn insert_walk_in(&self, w: &WalkInRow) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "INSERT OR IGNORE INTO walk_in_sessions
               (session_id, plate_normalized, plate_number, entry_gate_id, entered_at,
                entry_image_key, status, exit_gate_id, exited_at, amount_vnd, method,
                confirmed_by, waive_reason, bank_ref)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                w.session_id.to_string(),
                w.plate_normalized,
                w.plate_number,
                w.entry_gate_id.map(|u| u.to_string()),
                ts(&w.entered_at),
                w.entry_image_key,
                w.status,
                w.exit_gate_id.map(|u| u.to_string()),
                w.exited_at.as_ref().map(ts),
                w.amount_vnd,
                w.method,
                w.confirmed_by,
                w.waive_reason,
                w.bank_ref,
            ],
        )?;
        Ok(())
    }

    /// Newest open session for a normalized plate.
    pub fn open_walk_in(&self, plate_normalized: &str) -> Result<Option<WalkInRow>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                &format!(
                    "SELECT {WALK_IN_COLS} FROM walk_in_sessions
                     WHERE plate_normalized = ?1 AND status = 'open'
                     ORDER BY entered_at DESC LIMIT 1"
                ),
                params![plate_normalized],
                walk_in_from_row,
            )
            .optional()?)
    }

    pub fn walk_in(&self, session_id: Uuid) -> Result<Option<WalkInRow>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                &format!("SELECT {WALK_IN_COLS} FROM walk_in_sessions WHERE session_id = ?1"),
                params![session_id.to_string()],
                walk_in_from_row,
            )
            .optional()?)
    }

    /// Close an open session in a single `UPDATE ... WHERE status='open'`.
    /// Returns `false` (and changes nothing) when it was not open — the
    /// first settlement always wins.
    pub fn close_walk_in(
        &self,
        session_id: Uuid,
        exit_gate_id: Uuid,
        exited_at: DateTime<Utc>,
        amount_vnd: i64,
        s: &Settlement,
    ) -> Result<bool> {
        let status = if s.method == "waived" { "waived" } else { "paid" };
        let n = self.conn.lock().unwrap().execute(
            "UPDATE walk_in_sessions SET status = ?2, exit_gate_id = ?3, exited_at = ?4,
                amount_vnd = ?5, method = ?6, confirmed_by = ?7, waive_reason = ?8, bank_ref = ?9
             WHERE session_id = ?1 AND status = 'open'",
            params![
                session_id.to_string(),
                status,
                exit_gate_id.to_string(),
                ts(&exited_at),
                amount_vnd,
                s.method,
                s.confirmed_by,
                s.waive_reason,
                s.bank_ref,
            ],
        )?;
        Ok(n == 1)
    }

    /// Totals of sessions settled at or after `since`.
    pub fn walk_in_summary(&self, since: DateTime<Utc>) -> Result<WalkInSummary> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT method, COUNT(*), COALESCE(SUM(amount_vnd), 0) FROM walk_in_sessions
             WHERE status != 'open' AND exited_at >= ?1 GROUP BY method",
        )?;
        let rows = stmt.query_map(params![ts(&since)], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })?;
        let mut out = WalkInSummary::default();
        for row in rows {
            let (method, count, total) = row?;
            match method.as_deref() {
                Some("cash") => {
                    out.cash_count = count as u64;
                    out.cash_total_vnd = total;
                }
                Some("bank_qr") => {
                    out.bank_qr_count = count as u64;
                    out.bank_qr_total_vnd = total;
                }
                Some("waived") => out.waived_count = count as u64,
                _ => {}
            }
        }
        Ok(out)
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
        Ok(
            conn.query_row("SELECT COUNT(*) FROM pending_events", [], |r| {
                r.get::<_, i64>(0)
            })? as u64,
        )
    }

    /// Current outbox depth and cumulative count of events evicted at capacity.
    pub fn outbox_stats(&self) -> Result<(u64, u64)> {
        let conn = self.conn.lock().unwrap();
        let queue_depth = conn.query_row("SELECT COUNT(*) FROM pending_events", [], |r| {
            r.get::<_, i64>(0)
        })? as u64;
        let dropped_count = conn
            .query_row(
                "SELECT value FROM kv WHERE key = ?1",
                params![OUTBOX_DROPPED_KEY],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        Ok((queue_depth, dropped_count))
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
    /// When the cap triggers eviction the cumulative `dropped_events` counter
    /// is incremented and a `tracing::warn!` fires so operators can detect
    /// event loss during extended offline periods.
    pub fn enqueue_event(&self, kind: &str, body: serde_json::Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO pending_events (kind, body) VALUES (?1, ?2)",
            params![kind, body.to_string()],
        )?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pending_events", [], |r| r.get(0))?;
        if count > MAX_OUTBOX as i64 {
            let overflow = (count - MAX_OUTBOX as i64) as u64;
            // drop everything older than the newest MAX_OUTBOX rows
            conn.execute(
                "DELETE FROM pending_events WHERE id <=
                   (SELECT id FROM pending_events ORDER BY id DESC
                    LIMIT 1 OFFSET ?1)",
                params![MAX_OUTBOX as i64],
            )?;
            // Increment the cumulative dropped-events counter.
            let prev: u64 = conn
                .query_row(
                    "SELECT value FROM kv WHERE key = ?1",
                    params![OUTBOX_DROPPED_KEY],
                    |r| r.get::<_, String>(0),
                )
                .optional()?
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            let total = prev + overflow;
            conn.execute(
                "INSERT INTO kv (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![OUTBOX_DROPPED_KEY, total.to_string()],
            )?;
            warn!(
                queue_depth = MAX_OUTBOX,
                evicted = overflow,
                total_dropped = total,
                "outbox cap reached — oldest events evicted"
            );
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

    // ---------- paid-exit grants ----------

    /// Store a grant. Returns `false` (no-op) for a `payment_id` already
    /// held — every gate's command topic carries the same signal — or for a
    /// grant that has already expired. Expired grants are pruned first.
    pub fn insert_exit_grant(&self, g: &ExitGrant, now: DateTime<Utc>) -> Result<bool> {
        if g.expires_at <= now {
            return Ok(false);
        }
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM exit_grants WHERE expires_at <= ?1",
            params![ts(&now)],
        )?;
        let n = conn.execute(
            "INSERT OR IGNORE INTO exit_grants
               (payment_id, session_id, plate_number, plate_normalized, plate_local,
                paid_at, expires_at, used_at, received_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
            params![
                g.payment_id.to_string(),
                g.session_id.map(|u| u.to_string()),
                g.plate_number,
                g.plate_normalized,
                crate::access::normalize_plate(&g.plate_number),
                g.paid_at.as_ref().map(ts),
                ts(&g.expires_at),
                ts(&now),
            ],
        )?;
        Ok(n == 1)
    }

    /// Oldest unused, unexpired grant matching a normalized plate (against
    /// either the backend's `plateNormalized` or the edge's own
    /// normalization of `plateNumber`).
    pub fn find_exit_grant(&self, plate_normalized: &str, now: DateTime<Utc>) -> Result<Option<Uuid>> {
        let conn = self.conn.lock().unwrap();
        let id: Option<String> = conn
            .query_row(
                "SELECT payment_id FROM exit_grants
                 WHERE (plate_normalized = ?1 OR plate_local = ?1)
                   AND used_at IS NULL AND expires_at > ?2
                 ORDER BY expires_at ASC LIMIT 1",
                params![plate_normalized, ts(&now)],
                |r| r.get(0),
            )
            .optional()?;
        Ok(id.and_then(|s| Uuid::parse_str(&s).ok()))
    }

    /// Atomically claim a grant (single `UPDATE ... WHERE used_at IS NULL`).
    /// `false` when it was already used or has expired — two exit lanes can
    /// never both open on one payment.
    pub fn consume_exit_grant(&self, payment_id: Uuid, now: DateTime<Utc>) -> Result<bool> {
        let n = self.conn.lock().unwrap().execute(
            "UPDATE exit_grants SET used_at = ?2
             WHERE payment_id = ?1 AND used_at IS NULL AND expires_at > ?2",
            params![payment_id.to_string(), ts(&now)],
        )?;
        Ok(n == 1)
    }

    // ---------- tenant binding ----------

    /// Tenant this database's data belongs to, if recorded.
    pub fn bound_tenant(&self) -> Result<Option<Uuid>> {
        Ok(self
            .kv_get(BOUND_TENANT_KEY)?
            .and_then(|s| Uuid::parse_str(&s).ok()))
    }

    pub fn set_bound_tenant(&self, tenant: Uuid) -> Result<()> {
        self.kv_set(BOUND_TENANT_KEY, &tenant.to_string())
    }

    /// Total rows across the tenant-owned tables.
    pub fn tenant_data_rows(&self) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        let mut total = 0u64;
        for t in TENANT_TABLES {
            total += conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| {
                r.get::<_, i64>(0)
            })? as u64;
        }
        Ok(total)
    }

    /// Delete every tenant-owned row (and all `kv` state except
    /// database-level keys) in one transaction. Returns rows deleted per
    /// table, `kv` included.
    pub fn wipe_tenant_data(&self) -> Result<Vec<(&'static str, u64)>> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let mut out = Vec::new();
        for t in TENANT_TABLES {
            let n = tx.execute(&format!("DELETE FROM {t}"), [])? as u64;
            out.push((*t, n));
        }
        let keep = KV_KEEP_ON_WIPE
            .iter()
            .map(|k| format!("'{k}'"))
            .collect::<Vec<_>>()
            .join(",");
        let n = tx.execute(&format!("DELETE FROM kv WHERE key NOT IN ({keep})"), [])? as u64;
        out.push(("kv", n));
        tx.commit()?;
        Ok(out)
    }

    // ---------- retention ----------

    /// Drop local history older than `cutoff`: access events, settled
    /// walk-in sessions (open ones are kept whatever their age) and expired
    /// exit grants. The outbox (`pending_events`) is never pruned by age.
    pub fn prune_older_than(&self, cutoff: DateTime<Utc>, now: DateTime<Utc>) -> Result<RetentionPruned> {
        let conn = self.conn.lock().unwrap();
        // `occurred_at` is RFC 3339 with variable precision (or SQLite's
        // `datetime('now')` form) — compare as julian days, not text.
        let local_events = conn.execute(
            "DELETE FROM local_events WHERE julianday(occurred_at) < julianday(?1)",
            params![ts(&cutoff)],
        )? as u64;
        let walk_ins = conn.execute(
            "DELETE FROM walk_in_sessions
             WHERE status != 'open' AND COALESCE(exited_at, entered_at) < ?1",
            params![ts(&cutoff)],
        )? as u64;
        let exit_grants = conn.execute(
            "DELETE FROM exit_grants WHERE expires_at <= ?1",
            params![ts(&now)],
        )? as u64;
        Ok(RetentionPruned {
            local_events,
            walk_ins,
            exit_grants,
        })
    }
}

/// Retention for dedup rows; must comfortably exceed `MAX_COMMAND_AGE_SECS`.
const PROCESSED_COMMANDS_RETENTION_DAYS: u32 = 7;

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
        let conn = self.conn.lock().unwrap();
        // Bound the table: rows far older than the command freshness window
        // can never be redelivered as valid, so they are safe to drop.
        let _ = conn.execute(
            "DELETE FROM processed_commands WHERE processed_at < datetime('now', ?1)",
            params![format!("-{PROCESSED_COMMANDS_RETENTION_DAYS} days")],
        );
        let _ = conn.execute(
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
    fn old_processed_commands_are_pruned_on_record() {
        let (store, _d) = temp_store();
        let old = Uuid::new_v4();
        store.record(old, true);
        store
            .conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE processed_commands SET processed_at = datetime('now', '-30 days')",
                [],
            )
            .unwrap();
        let fresh = Uuid::new_v4();
        store.record(fresh, true);
        assert!(store.seen(old).is_none());
        assert_eq!(store.seen(fresh), Some(true));
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
    fn outbox_eviction_increments_dropped_counter() {
        let (store, _d) = temp_store();
        // Fill to cap, no drops yet.
        for i in 0..MAX_OUTBOX {
            store.enqueue_event("access", json!({"i": i})).unwrap();
        }
        let (depth, dropped) = store.outbox_stats().unwrap();
        assert_eq!(depth, MAX_OUTBOX);
        assert_eq!(dropped, 0);

        // One more triggers eviction — exactly 1 event dropped.
        store
            .enqueue_event("access", json!({"i": MAX_OUTBOX}))
            .unwrap();
        let (depth, dropped) = store.outbox_stats().unwrap();
        assert_eq!(depth, MAX_OUTBOX);
        assert_eq!(dropped, 1);

        // Another overflow — counter is cumulative.
        store
            .enqueue_event("access", json!({"i": MAX_OUTBOX + 1}))
            .unwrap();
        let (depth, dropped) = store.outbox_stats().unwrap();
        assert_eq!(depth, MAX_OUTBOX);
        assert_eq!(dropped, 2);

        // Verify the oldest surviving event is i=2 (first two were evicted).
        let rows = store.drain_events(1).unwrap();
        assert_eq!(rows[0].2["i"].as_u64().unwrap(), 2);
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

    fn open_row(plate: &str) -> WalkInRow {
        WalkInRow {
            session_id: Uuid::new_v4(),
            plate_normalized: plate.into(),
            plate_number: plate.into(),
            entry_gate_id: Some(Uuid::new_v4()),
            entered_at: Utc::now() - chrono::Duration::hours(2),
            entry_image_key: None,
            status: "open".into(),
            exit_gate_id: None,
            exited_at: None,
            amount_vnd: None,
            method: None,
            confirmed_by: None,
            waive_reason: None,
            bank_ref: None,
        }
    }

    fn settle_as(method: &str) -> Settlement {
        Settlement {
            method: method.into(),
            confirmed_by: "manual".into(),
            waive_reason: if method == "waived" {
                Some("Xe công vụ".into())
            } else {
                None
            },
            bank_ref: None,
        }
    }

    #[test]
    fn close_walk_in_is_once_only() {
        let (store, _d) = temp_store();
        let w = open_row("29H11122");
        store.insert_walk_in(&w).unwrap();
        // re-inserting an existing id is ignored
        store
            .insert_walk_in(&WalkInRow {
                plate_number: "X".into(),
                ..w.clone()
            })
            .unwrap();
        assert_eq!(
            store.walk_in(w.session_id).unwrap().unwrap().plate_number,
            "29H11122"
        );

        let gate = Uuid::new_v4();
        assert!(store
            .close_walk_in(w.session_id, gate, Utc::now(), 30_000, &settle_as("cash"))
            .unwrap());
        assert!(!store
            .close_walk_in(w.session_id, gate, Utc::now(), 99, &settle_as("bank_qr"))
            .unwrap());
        let got = store.walk_in(w.session_id).unwrap().unwrap();
        assert_eq!(got.status, "paid");
        assert_eq!(got.amount_vnd, Some(30_000));
        assert_eq!(got.method.as_deref(), Some("cash"));
        assert!(store.open_walk_in("29H11122").unwrap().is_none());
    }

    #[test]
    fn open_walk_in_returns_newest_open() {
        let (store, _d) = temp_store();
        let old = open_row("A1");
        let mut new = open_row("A1");
        new.entered_at = Utc::now();
        store.insert_walk_in(&old).unwrap();
        store.insert_walk_in(&new).unwrap();
        assert_eq!(
            store.open_walk_in("A1").unwrap().unwrap().session_id,
            new.session_id
        );
    }

    #[test]
    fn walk_in_summary_groups_by_method() {
        let (store, _d) = temp_store();
        let gate = Uuid::new_v4();
        let since = Utc::now() - chrono::Duration::minutes(1);
        for (plate, method, amount) in [
            ("A", "cash", 20_000),
            ("B", "cash", 15_000),
            ("C", "bank_qr", 30_000),
            ("D", "waived", 0),
        ] {
            let w = open_row(plate);
            store.insert_walk_in(&w).unwrap();
            store
                .close_walk_in(w.session_id, gate, Utc::now(), amount, &settle_as(method))
                .unwrap();
        }
        store.insert_walk_in(&open_row("E")).unwrap(); // still open: not counted
        let old = open_row("F"); // settled before `since`: not counted
        store.insert_walk_in(&old).unwrap();
        store
            .close_walk_in(
                old.session_id,
                gate,
                since - chrono::Duration::hours(1),
                5_000,
                &settle_as("cash"),
            )
            .unwrap();

        assert_eq!(
            store.walk_in_summary(since).unwrap(),
            WalkInSummary {
                cash_count: 2,
                cash_total_vnd: 35_000,
                bank_qr_count: 1,
                bank_qr_total_vnd: 30_000,
                waived_count: 1,
            }
        );
    }

    #[test]
    fn site_pricing_without_site_name_still_loads() {
        let (store, _d) = temp_store();
        // Value stored by an older build: no `siteName` key.
        store
            .kv_set(
                "site_pricing",
                r#"{"pricing":{"hourlyFrom":10000,"dailyFrom":null,"overnightFrom":null,"graceMinutes":0,"blockMinutes":60,"overnightStartHour":22,"overnightEndHour":6},"timezone":"UTC","bankAccount":null,"updatedAt":"2026-11-16T00:00:00Z"}"#,
            )
            .unwrap();
        let p = store.site_pricing().unwrap().unwrap();
        assert_eq!(p.site_name, None);
        assert_eq!(p.timezone, "UTC");
    }

    #[test]
    fn site_pricing_round_trips_and_overwrites() {
        let (store, _d) = temp_store();
        assert!(store.site_pricing().unwrap().is_none());
        let mut p = StoredPricing {
            pricing: crate::pricing::SitePricing {
                hourly_from: Some(10_000),
                daily_from: None,
                overnight_from: None,
                grace_minutes: 0,
                block_minutes: 60,
                overnight_start_hour: 22,
                overnight_end_hour: 6,
            },
            timezone: "Asia/Ho_Chi_Minh".into(),
            bank_account: Some(BankAccount {
                bin: "970436".into(),
                account_number: "0123456789".into(),
                account_name: "CONG TY ABC".into(),
            }),
            site_name: Some("Bãi A".into()),
            updated_at: "2026-11-16T00:00:00Z".into(),
        };
        store.put_site_pricing(&p).unwrap();
        assert_eq!(store.site_pricing().unwrap().unwrap(), p);
        p.pricing.hourly_from = Some(12_000);
        p.bank_account = None;
        store.put_site_pricing(&p).unwrap();
        assert_eq!(store.site_pricing().unwrap().unwrap(), p);
    }

    fn grant(plate: &str, expires_at: DateTime<Utc>) -> ExitGrant {
        ExitGrant {
            payment_id: Uuid::new_v4(),
            session_id: None,
            plate_number: plate.into(),
            plate_normalized: crate::access::normalize_plate(plate),
            paid_at: None,
            expires_at,
        }
    }

    #[test]
    fn exit_grant_is_consumed_once() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        let g = grant("51A99999", now + chrono::Duration::minutes(15));
        assert!(store.insert_exit_grant(&g, now).unwrap());
        assert!(!store.insert_exit_grant(&g, now).unwrap(), "duplicate is a no-op");
        assert_eq!(store.find_exit_grant("51A99999", now).unwrap(), Some(g.payment_id));
        assert!(store.consume_exit_grant(g.payment_id, now).unwrap());
        assert!(!store.consume_exit_grant(g.payment_id, now).unwrap());
        assert_eq!(store.find_exit_grant("51A99999", now).unwrap(), None);
    }

    #[test]
    fn expired_exit_grants_are_pruned_on_insert() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        let g = grant("A1", now + chrono::Duration::minutes(1));
        store.insert_exit_grant(&g, now).unwrap();
        let later = now + chrono::Duration::minutes(5);
        assert!(!store.consume_exit_grant(g.payment_id, later).unwrap());
        store
            .insert_exit_grant(&grant("B2", later + chrono::Duration::minutes(5)), later)
            .unwrap();
        let n: i64 = store
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM exit_grants", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "expired grant pruned");
    }

    #[test]
    fn retention_prunes_old_events_and_settled_walk_ins_only() {
        let (store, _d) = temp_store();
        let now = Utc::now();
        store.record_local_event("NEW", "entry", "allow").unwrap();
        {
            let conn = store.conn.lock().unwrap();
            // both timestamp forms that exist in the table
            conn.execute(
                "INSERT INTO local_events (plate_normalized, direction, decision, occurred_at)
                 VALUES ('OLD1', 'entry', 'allow', ?1)",
                params![dt_s(&(now - chrono::Duration::days(40)))],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO local_events (plate_normalized, direction, decision, occurred_at)
                 VALUES ('OLD2', 'entry', 'allow', datetime('now', '-40 days'))",
                [],
            )
            .unwrap();
        }
        let gate = Uuid::new_v4();
        let old_settled = open_row("S1");
        store.insert_walk_in(&old_settled).unwrap();
        store
            .close_walk_in(
                old_settled.session_id,
                gate,
                now - chrono::Duration::days(40),
                10_000,
                &settle_as("cash"),
            )
            .unwrap();
        let mut old_open = open_row("O1");
        old_open.entered_at = now - chrono::Duration::days(60);
        store.insert_walk_in(&old_open).unwrap();
        let recent = open_row("R1");
        store.insert_walk_in(&recent).unwrap();
        store
            .close_walk_in(recent.session_id, gate, now, 10_000, &settle_as("cash"))
            .unwrap();
        store.enqueue_event("anpr", json!({"i": 0})).unwrap();

        let pruned = store
            .prune_older_than(now - chrono::Duration::days(30), now)
            .unwrap();
        assert_eq!(pruned.local_events, 2);
        assert_eq!(pruned.walk_ins, 1);
        assert!(store.last_local_event("NEW", "entry").unwrap().is_some());
        assert!(store.walk_in(old_settled.session_id).unwrap().is_none());
        assert!(store.walk_in(old_open.session_id).unwrap().is_some(), "open session kept");
        assert!(store.walk_in(recent.session_id).unwrap().is_some());
        assert_eq!(store.pending_count().unwrap(), 1, "outbox untouched");
    }

    #[test]
    fn wipe_tenant_data_clears_tables_and_kv() {
        let (store, _d) = temp_store();
        store.enqueue_event("anpr", json!({})).unwrap();
        store.record_local_event("A", "entry", "allow").unwrap();
        store.record(Uuid::new_v4(), true);
        store.kv_set("site_pricing", "{}").unwrap();
        store.kv_set("schema_version", "1").unwrap();
        store.set_bound_tenant(Uuid::new_v4()).unwrap();
        assert_eq!(store.tenant_data_rows().unwrap(), 3);
        let wiped = store.wipe_tenant_data().unwrap();
        assert!(wiped.iter().any(|(t, n)| *t == "pending_events" && *n == 1));
        assert_eq!(store.tenant_data_rows().unwrap(), 0);
        assert!(store.kv_get("site_pricing").unwrap().is_none());
        assert!(store.bound_tenant().unwrap().is_none());
        assert_eq!(store.kv_get("schema_version").unwrap().as_deref(), Some("1"));
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
