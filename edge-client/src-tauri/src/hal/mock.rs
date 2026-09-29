//! Scriptable relay backend for HAL/command tests.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

use anyhow::{bail, Result};
use async_trait::async_trait;
use tokio::time::Instant;

use super::relay::RelayBackend;

#[derive(Default)]
pub struct MockBackend {
    /// `(idx, on, when)` for every accepted `set_output`.
    pub outputs: Mutex<Vec<(u8, bool, Instant)>>,
    /// Attempts including rejected ones — `(idx, on)`.
    pub attempts: Mutex<Vec<(u8, bool)>>,
    pub inputs: Mutex<Option<Vec<bool>>>,
    /// Fail this many upcoming calls (any method) with an error.
    pub fail_next: AtomicUsize,
    /// Reject every `set_output(_, false)`.
    pub fail_off: AtomicBool,
    pub probes: AtomicUsize,
}

impl MockBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_inputs(inputs: Vec<bool>) -> Self {
        let m = Self::default();
        *m.inputs.lock().unwrap() = Some(inputs);
        m
    }

    fn take_failure(&self) -> bool {
        self.fail_next
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
            .is_ok()
    }

    pub fn outputs(&self) -> Vec<(u8, bool)> {
        self.outputs
            .lock()
            .unwrap()
            .iter()
            .map(|(i, o, _)| (*i, *o))
            .collect()
    }

    pub fn attempts(&self) -> Vec<(u8, bool)> {
        self.attempts.lock().unwrap().clone()
    }

    pub fn set_inputs(&self, inputs: Option<Vec<bool>>) {
        *self.inputs.lock().unwrap() = inputs;
    }
}

#[async_trait]
impl RelayBackend for MockBackend {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        self.attempts.lock().unwrap().push((idx, on));
        if self.take_failure() {
            bail!("mock failure");
        }
        if !on && self.fail_off.load(Ordering::SeqCst) {
            bail!("mock off failure");
        }
        self.outputs.lock().unwrap().push((idx, on, Instant::now()));
        Ok(())
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        if self.take_failure() {
            bail!("mock failure");
        }
        Ok(self.inputs.lock().unwrap().clone())
    }

    async fn probe(&self) -> Result<()> {
        self.probes.fetch_add(1, Ordering::SeqCst);
        if self.take_failure() {
            bail!("mock failure");
        }
        Ok(())
    }

    fn kind(&self) -> &'static str {
        "mock"
    }
}
