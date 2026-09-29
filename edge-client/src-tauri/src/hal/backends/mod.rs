//! Concrete `RelayBackend` constructors, one per `RelayBackendConfig` variant.

use std::sync::Arc;

use anyhow::{bail, Result};

use super::config::BarrierConfig;
use super::relay::RelayBackend;

pub fn build(cfg: &BarrierConfig) -> Result<Arc<dyn RelayBackend>> {
    bail!("relay backend '{}' not implemented", cfg.backend.kind())
}
