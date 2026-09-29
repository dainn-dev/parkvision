//! Concrete `RelayBackend` constructors, one per `RelayBackendConfig` variant.

pub mod dahua;
pub mod digest;
pub mod hikvision;

use std::sync::Arc;

use anyhow::{bail, Result};

use super::config::{BarrierConfig, RelayBackendConfig};
use super::relay::RelayBackend;

/// 1-based input indices the site wired up (empty when feedback is off).
fn configured_inputs(cfg: &BarrierConfig) -> Vec<u8> {
    cfg.inputs
        .map(|m| {
            let mut v: Vec<u8> = [m.open_limit, m.closed_limit, m.r#loop]
                .into_iter()
                .flatten()
                .collect();
            v.sort_unstable();
            v.dedup();
            v
        })
        .unwrap_or_default()
}

pub fn build(cfg: &BarrierConfig) -> Result<Arc<dyn RelayBackend>> {
    let inputs = configured_inputs(cfg);
    let input_count = cfg.inputs.map(|m| m.max_index()).unwrap_or(0);
    Ok(match &cfg.backend {
        RelayBackendConfig::Hikvision {
            host,
            port,
            username,
            password,
        } => Arc::new(hikvision::HikvisionIsapi::new(
            host, *port, username, password, inputs,
        )?),
        RelayBackendConfig::Dahua {
            host,
            port,
            username,
            password,
            strobe,
        } => Arc::new(dahua::DahuaCgi::new(
            host,
            *port,
            username,
            password,
            *strobe,
            input_count,
        )?),
        other => bail!("relay backend '{}' not implemented", other.kind()),
    })
}
