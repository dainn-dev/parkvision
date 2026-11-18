//! Local data retention (D-EDG-3). A periodic pass — hourly, on its own
//! task and inside `spawn_blocking`, never on the 50 ms FSM tick — drops
//! history older than `retentionDays` (config, default 30):
//!   * `local_events` and settled walk-in sessions in `edge.db`,
//!   * expired paid-exit grants,
//!   * files in `captures/` by modification time.
//! The outbox (`pending_events`) is never pruned by age; it has its own
//! 10,000-row cap. Data at rest is NOT encrypted.

use std::path::Path;
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use tracing::{info, warn};

use crate::store::{RetentionPruned, Store};

/// Delete regular files directly inside `dir` last modified before
/// `cutoff`. Returns how many were removed.
pub fn prune_files_older_than(dir: &Path, cutoff: SystemTime) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let old = meta.modified().map(|m| m < cutoff).unwrap_or(false);
        if old {
            match std::fs::remove_file(entry.path()) {
                Ok(()) => removed += 1,
                Err(e) => warn!("retention: could not remove {}: {e}", entry.path().display()),
            }
        }
    }
    removed
}

#[derive(Debug, Default, PartialEq)]
pub struct RetentionReport {
    pub db: RetentionPruned,
    pub capture_files: u64,
}

/// One retention pass.
pub fn run_once(
    store: &Store,
    captures_dir: &Path,
    retention_days: u32,
    now: DateTime<Utc>,
) -> RetentionReport {
    let window = chrono::Duration::days(i64::from(retention_days.max(1)));
    let cutoff = now - window;
    let db = match store.prune_older_than(cutoff, now) {
        Ok(p) => p,
        Err(e) => {
            warn!("retention: database prune failed: {e:#}");
            RetentionPruned::default()
        }
    };
    let file_cutoff =
        SystemTime::UNIX_EPOCH + Duration::from_millis(cutoff.timestamp_millis().max(0) as u64);
    let capture_files = prune_files_older_than(captures_dir, file_cutoff);
    let report = RetentionReport { db, capture_files };
    if report != RetentionReport::default() {
        info!(
            local_events = report.db.local_events,
            walk_ins = report.db.walk_ins,
            exit_grants = report.db.exit_grants,
            capture_files = report.capture_files,
            retention_days,
            "retention pass pruned local data"
        );
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prunes_only_files_older_than_cutoff() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.jpg");
        let new = dir.path().join("new.jpg");
        std::fs::write(&old, b"o").unwrap();
        std::fs::write(&new, b"n").unwrap();
        let f = std::fs::File::options().write(true).open(&old).unwrap();
        f.set_modified(SystemTime::now() - Duration::from_secs(40 * 86_400))
            .unwrap();
        drop(f);
        let cutoff = SystemTime::now() - Duration::from_secs(30 * 86_400);
        assert_eq!(prune_files_older_than(dir.path(), cutoff), 1);
        assert!(!old.exists());
        assert!(new.exists());
    }

    #[test]
    fn missing_captures_dir_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            prune_files_older_than(&dir.path().join("nope"), SystemTime::now()),
            0
        );
    }

    #[test]
    fn run_once_prunes_db_and_files_but_not_outbox() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join("edge.db")).unwrap();
        let caps = dir.path().join("captures");
        std::fs::create_dir_all(&caps).unwrap();
        let old = caps.join("old.jpg");
        std::fs::write(&old, b"o").unwrap();
        let f = std::fs::File::options().write(true).open(&old).unwrap();
        f.set_modified(SystemTime::now() - Duration::from_secs(40 * 86_400))
            .unwrap();
        drop(f);
        store.enqueue_event("anpr", serde_json::json!({"x": 1})).unwrap();
        store.record_local_event("A1", "entry", "allow").unwrap();

        // 40 days from now everything recorded "now" is past a 30-day cutoff
        let later = Utc::now() + chrono::Duration::days(40);
        let report = run_once(&store, &caps, 30, later);
        assert_eq!(report.db.local_events, 1);
        assert_eq!(report.capture_files, 1);
        assert_eq!(store.pending_count().unwrap(), 1, "outbox is never aged out");
    }
}
