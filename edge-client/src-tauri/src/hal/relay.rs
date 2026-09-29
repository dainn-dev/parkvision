//! Relay hardware abstraction — whatever closes the barrier board's dry
//! contacts (camera alarm-out, USB/serial relay, Modbus module, ZK C3).
//! Indices are 1-based to match vendor manuals; implementations convert.

use std::time::Duration;

use anyhow::{bail, Result};
use async_trait::async_trait;

#[async_trait]
pub trait RelayBackend: Send + Sync {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()>;

    /// ON → hold `ms` → OFF. Backends with native pulse support override.
    async fn pulse(&self, idx: u8, ms: u64) -> Result<()> {
        self.set_output(idx, true).await?;
        tokio::time::sleep(Duration::from_millis(ms)).await;
        self.set_output(idx, false).await
    }

    /// `Ok(None)` when the hardware has no digital inputs.
    async fn read_inputs(&self) -> Result<Option<Vec<bool>>>;

    /// Cheap connectivity check for the settings screen.
    async fn probe(&self) -> Result<()>;

    fn kind(&self) -> &'static str;
}

/// Stand-in when the configured backend could not be constructed — every
/// call fails so the HAL reports `link_ok = false` instead of the runtime
/// refusing to boot.
pub struct FailedBackend {
    pub reason: String,
}

#[async_trait]
impl RelayBackend for FailedBackend {
    async fn set_output(&self, _idx: u8, _on: bool) -> Result<()> {
        bail!("relay backend unavailable: {}", self.reason)
    }
    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        bail!("relay backend unavailable: {}", self.reason)
    }
    async fn probe(&self) -> Result<()> {
        bail!("relay backend unavailable: {}", self.reason)
    }
    fn kind(&self) -> &'static str {
        "failed"
    }
}
