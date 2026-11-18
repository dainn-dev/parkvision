//! Tenant binding of local data (D-EDG-1 option c / D-EDG-2 option a).
//!
//! `edge.db`, `captures/` and `camera-workers/` survive a deprovision. When
//! the device is re-activated for a *different* tenant, that data — cached
//! whitelist, outbox, walk-in sessions, photos — belongs to someone else and
//! must not be served or flushed under the new credential. The bound tenant
//! is kept in `kv` (`bound_tenant_id`).

use std::path::Path;

use anyhow::Result;
use tracing::{info, warn};
use uuid::Uuid;

use crate::store::Store;

/// Why `bind_tenant` is being called.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BindMode {
    /// Redeeming an activation code. Data with no recorded tenant is
    /// treated as foreign when non-empty.
    Activation,
    /// Booting an already-persisted config. Data with no recorded tenant was
    /// produced under this config (pre-binding builds) and is adopted.
    Boot,
}

/// What `bind_tenant` did.
#[derive(Debug, PartialEq, Eq)]
pub enum BindOutcome {
    /// Data already bound to this tenant — kept (the outbox will flush).
    Kept,
    /// No tenant recorded; the tenant was recorded without wiping.
    Adopted,
    /// Data belonged to another (or an unknown) tenant and was wiped.
    Wiped {
        previous: Option<Uuid>,
        rows: u64,
        files: u64,
    },
}

/// Remove every entry inside `dir` (the directory itself is kept). Returns
/// the number of top-level entries removed; failures are logged and skipped.
pub fn clear_dir(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let res = if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        match res {
            Ok(()) => removed += 1,
            Err(e) => warn!("tenant wipe: could not remove {}: {e}", path.display()),
        }
    }
    removed
}

/// Make sure local data belongs to `tenant` before a runtime starts on it.
pub fn bind_tenant(
    store: &Store,
    app_data: &Path,
    tenant: Uuid,
    mode: BindMode,
) -> Result<BindOutcome> {
    let previous = store.bound_tenant()?;
    let foreign = match previous {
        Some(p) => p != tenant,
        // Unknown owner: on activation, non-empty data is assumed foreign;
        // on boot it was produced under this config and is adopted.
        None => mode == BindMode::Activation && store.tenant_data_rows()? > 0,
    };
    if !foreign {
        let outcome = if previous == Some(tenant) {
            BindOutcome::Kept
        } else {
            BindOutcome::Adopted
        };
        store.set_bound_tenant(tenant)?;
        return Ok(outcome);
    }

    let wiped = store.wipe_tenant_data()?;
    let rows: u64 = wiped.iter().map(|(_, n)| n).sum();
    let files =
        clear_dir(&app_data.join("captures")) + clear_dir(&app_data.join("camera-workers"));
    store.set_bound_tenant(tenant)?;
    warn!(
        previous = ?previous,
        new_tenant = %tenant,
        rows,
        files,
        tables = ?wiped,
        "local data belonged to another tenant: wiped edge.db tables, captures/ and camera-workers/"
    );
    info!("edge.db now bound to tenant {tenant}");
    Ok(BindOutcome::Wiped {
        previous,
        rows,
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::VehicleRow;

    const A: &str = "11111111-1111-1111-1111-111111111111";
    const B: &str = "99999999-9999-9999-9999-999999999999";

    fn t(s: &str) -> Uuid {
        Uuid::parse_str(s).unwrap()
    }

    struct Fixture {
        dir: tempfile::TempDir,
        store: Store,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join("edge.db")).unwrap();
        Fixture { dir, store }
    }

    fn seed(f: &Fixture) {
        f.store
            .upsert_vehicle(&VehicleRow {
                plate_normalized: "30E89241".into(),
                tag: "resident".into(),
                valid_from: None,
                valid_to: None,
                status: "active".into(),
                updated_at: chrono::Utc::now(),
            })
            .unwrap();
        f.store
            .enqueue_event("anpr", serde_json::json!({"plateNumber": "30E89241"}))
            .unwrap();
        f.store.record_local_event("30E89241", "entry", "allow").unwrap();
        f.store.kv_set("whitelist_synced_at", "2026-11-01T00:00:00Z").unwrap();
        let caps = f.dir.path().join("captures");
        std::fs::create_dir_all(&caps).unwrap();
        std::fs::write(caps.join("plate-1.jpg"), b"jpg").unwrap();
        let workers = f.dir.path().join("camera-workers").join("cam-1");
        std::fs::create_dir_all(&workers).unwrap();
        std::fs::write(workers.join("state.json"), b"{}").unwrap();
    }

    fn captures_empty(f: &Fixture) -> bool {
        std::fs::read_dir(f.dir.path().join("captures"))
            .map(|mut d| d.next().is_none())
            .unwrap_or(true)
    }

    #[test]
    fn same_tenant_reactivation_keeps_data() {
        let f = fixture();
        seed(&f);
        f.store.set_bound_tenant(t(A)).unwrap();
        let out = bind_tenant(&f.store, f.dir.path(), t(A), BindMode::Activation).unwrap();
        assert_eq!(out, BindOutcome::Kept);
        assert_eq!(f.store.pending_count().unwrap(), 1);
        assert_eq!(f.store.whitelist_count().unwrap(), 1);
        assert!(!captures_empty(&f));
    }

    #[test]
    fn different_tenant_activation_wipes_everything() {
        let f = fixture();
        seed(&f);
        f.store.set_bound_tenant(t(A)).unwrap();
        let out = bind_tenant(&f.store, f.dir.path(), t(B), BindMode::Activation).unwrap();
        assert!(matches!(out, BindOutcome::Wiped { previous: Some(p), .. } if p == t(A)));
        assert_eq!(f.store.tenant_data_rows().unwrap(), 0);
        assert_eq!(f.store.kv_get("whitelist_synced_at").unwrap(), None);
        assert_eq!(f.store.bound_tenant().unwrap(), Some(t(B)));
        assert!(captures_empty(&f));
        let workers = f.dir.path().join("camera-workers");
        assert!(std::fs::read_dir(&workers).map(|mut d| d.next().is_none()).unwrap_or(true));
    }

    #[test]
    fn different_tenant_on_boot_also_wipes() {
        let f = fixture();
        seed(&f);
        f.store.set_bound_tenant(t(A)).unwrap();
        let out = bind_tenant(&f.store, f.dir.path(), t(B), BindMode::Boot).unwrap();
        assert!(matches!(out, BindOutcome::Wiped { .. }));
        assert_eq!(f.store.tenant_data_rows().unwrap(), 0);
    }

    #[test]
    fn unknown_tenant_with_data_is_wiped_on_activation() {
        let f = fixture();
        seed(&f);
        let out = bind_tenant(&f.store, f.dir.path(), t(B), BindMode::Activation).unwrap();
        assert!(matches!(out, BindOutcome::Wiped { previous: None, .. }));
        assert_eq!(f.store.tenant_data_rows().unwrap(), 0);
        assert!(captures_empty(&f));
        assert_eq!(f.store.bound_tenant().unwrap(), Some(t(B)));
    }

    #[test]
    fn unknown_tenant_with_empty_tables_is_adopted() {
        let f = fixture();
        let out = bind_tenant(&f.store, f.dir.path(), t(B), BindMode::Activation).unwrap();
        assert_eq!(out, BindOutcome::Adopted);
        assert_eq!(f.store.bound_tenant().unwrap(), Some(t(B)));
    }

    #[test]
    fn unknown_tenant_on_boot_is_adopted_without_wipe() {
        // upgrade from a pre-binding build: the persisted config's tenant
        // produced this data, so the outbox must survive.
        let f = fixture();
        seed(&f);
        let out = bind_tenant(&f.store, f.dir.path(), t(A), BindMode::Boot).unwrap();
        assert_eq!(out, BindOutcome::Adopted);
        assert_eq!(f.store.pending_count().unwrap(), 1);
        assert!(!captures_empty(&f));
    }
}
