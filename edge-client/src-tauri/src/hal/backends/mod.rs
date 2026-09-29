//! Concrete `RelayBackend` constructors, one per `RelayBackendConfig` variant.

pub mod dahua;
pub mod digest;
pub mod hikvision;
pub mod modbus;
pub mod serial_lcus;
pub mod zk_c3;

use std::sync::Arc;

use anyhow::Result;

use super::config::{BarrierConfig, RelayBackendConfig, SerialProtocol, ZkOutput};
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
        RelayBackendConfig::Serial {
            port,
            protocol: SerialProtocol::Lcus,
            baud,
            ..
        } => Arc::new(serial_lcus::LcusRelay::new(port, *baud)?),
        RelayBackendConfig::Serial {
            port,
            protocol: SerialProtocol::ModbusRtu,
            baud,
            unit_id,
        } => Arc::new(modbus::ModbusRelay::rtu(
            port,
            *baud,
            *unit_id,
            input_count as u16,
        )),
        RelayBackendConfig::ModbusTcp {
            host,
            port,
            unit_id,
        } => Arc::new(modbus::ModbusRelay::tcp(
            host,
            *port,
            *unit_id,
            input_count as u16,
        )),
        RelayBackendConfig::ZkC3 {
            host,
            port,
            password,
            output,
        } => {
            let kind = match output {
                ZkOutput::Aux => zk_c3::OutputKind::Aux,
                ZkOutput::Door => zk_c3::OutputKind::Door,
            };
            let mut doors = Vec::new();
            if let Some(m) = cfg.inputs {
                if let Some(d) = m.open_limit {
                    doors.push((d, zk_c3::InputRole::OpenLimit));
                }
                if let Some(d) = m.closed_limit {
                    doors.push((d, zk_c3::InputRole::ClosedLimit));
                }
            }
            Arc::new(zk_c3::ZkC3::new(host, *port, password.clone(), kind, doors))
        }
    })
}
