use std::collections::HashMap;
use std::time::{Duration, Instant};

use uuid::Uuid;

const MAX_LATENCY_MS: u128 = u32::MAX as u128;

/// Runtime-reported firmware version — the crate's own build version, the
/// same value `tauri.conf.json`/the updater already treat as "current
/// version". Single seam so no payload builder hardcodes it.
pub fn firmware_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug)]
pub struct HeartbeatTracker {
    max_pending: usize,
    timeout: Duration,
    pending: HashMap<Uuid, Instant>,
    latest_latency_ms: Option<u32>,
}

impl HeartbeatTracker {
    pub fn new(max_pending: usize, timeout: Duration) -> Self {
        Self {
            max_pending: max_pending.max(1),
            timeout,
            pending: HashMap::new(),
            latest_latency_ms: None,
        }
    }

    pub fn register(&mut self, id: Uuid, sent_at: Instant) {
        self.expire(sent_at);
        if self.pending.len() >= self.max_pending {
            if let Some(oldest) = self
                .pending
                .iter()
                .min_by_key(|(_, instant)| **instant)
                .map(|(id, _)| *id)
            {
                self.pending.remove(&oldest);
            }
        }
        self.pending.insert(id, sent_at);
    }

    pub fn acknowledge(&mut self, id: Uuid, received_at: Instant) -> Option<u32> {
        let sent_at = self.pending.remove(&id)?;
        let millis = received_at
            .saturating_duration_since(sent_at)
            .as_millis()
            .min(MAX_LATENCY_MS) as u32;
        self.latest_latency_ms = Some(millis);
        Some(millis)
    }

    pub fn expire(&mut self, now: Instant) {
        self.pending
            .retain(|_, sent_at| now.saturating_duration_since(*sent_at) <= self.timeout);
    }

    pub fn latest_latency_ms(&self) -> Option<u32> {
        self.latest_latency_ms
    }

    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching_ack_returns_elapsed_milliseconds_and_updates_latest_sample() {
        let mut tracker = HeartbeatTracker::new(4, Duration::from_secs(30));
        let id = Uuid::new_v4();
        let sent = Instant::now();
        tracker.register(id, sent);

        assert_eq!(
            tracker.acknowledge(id, sent + Duration::from_millis(42)),
            Some(42)
        );
        assert_eq!(tracker.latest_latency_ms(), Some(42));
        assert_eq!(tracker.pending_len(), 0);
    }

    #[test]
    fn wrong_ack_id_is_ignored() {
        let mut tracker = HeartbeatTracker::new(4, Duration::from_secs(30));
        tracker.register(Uuid::new_v4(), Instant::now());

        assert_eq!(tracker.acknowledge(Uuid::new_v4(), Instant::now()), None);
        assert_eq!(tracker.pending_len(), 1);
    }

    #[test]
    fn expired_entries_are_removed() {
        let mut tracker = HeartbeatTracker::new(4, Duration::from_secs(5));
        let sent = Instant::now();
        let id = Uuid::new_v4();
        tracker.register(id, sent);

        tracker.expire(sent + Duration::from_secs(6));
        assert_eq!(tracker.pending_len(), 0);
        assert_eq!(tracker.acknowledge(id, sent + Duration::from_secs(6)), None);
    }

    #[test]
    fn pending_entries_are_capped_without_unbounded_growth() {
        let mut tracker = HeartbeatTracker::new(2, Duration::from_secs(30));
        let sent = Instant::now();
        tracker.register(Uuid::new_v4(), sent);
        tracker.register(Uuid::new_v4(), sent + Duration::from_millis(1));
        tracker.register(Uuid::new_v4(), sent + Duration::from_millis(2));

        assert_eq!(tracker.pending_len(), 2);
    }

    #[test]
    fn sub_millisecond_result_is_zero_but_missing_sample_is_none() {
        let mut tracker = HeartbeatTracker::new(4, Duration::from_secs(30));
        let id = Uuid::new_v4();
        let sent = Instant::now();
        tracker.register(id, sent);

        assert_eq!(tracker.latest_latency_ms(), None);
        assert_eq!(
            tracker.acknowledge(id, sent + Duration::from_nanos(1)),
            Some(0)
        );
    }
}
