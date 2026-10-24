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

/// Add an operator-facing hint when a serial port cannot be opened because
/// another process or the OS has denied access to it.
fn serial_open_error(port: &str, error: impl std::fmt::Display) -> anyhow::Error {
    let detail = error.to_string();
    let lower = detail.to_ascii_lowercase();
    // Match on the error text rather than a concrete error type: the exact
    // type returned by `tokio_serial`/`serialport` varies by platform and
    // crate version, but the OS-level message for "another process has
    // this port open" is consistent across Windows/Linux/macOS.
    let busy = lower.contains("permission denied")
        || lower.contains("access is denied")
        || lower.contains("device or resource busy")
        || lower.contains("resource busy")
        || lower.contains("already in use")
        || lower.contains("used by another process");

    if busy {
        anyhow::anyhow!(
            "serial port {port} is busy or access is denied — another application may be using it (close RealTerm/PuTTY/other serial tools and retry): {detail}"
        )
    } else {
        anyhow::anyhow!("open serial port {port}: {detail}")
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serial_open_error_flags_busy_port_windows() {
        let err = serial_open_error("COM5", "Access is denied. (os error 5)");
        let msg = format!("{err}");
        assert!(msg.contains("COM5"), "{msg}");
        assert!(msg.contains("busy"), "{msg}");
        assert!(msg.contains("RealTerm"), "{msg}");
    }

    #[test]
    fn serial_open_error_flags_busy_port_unix() {
        let err = serial_open_error("/dev/ttyUSB0", "Device or resource busy (os error 16)");
        let msg = format!("{err}");
        assert!(msg.contains("/dev/ttyUSB0"), "{msg}");
        assert!(msg.contains("busy"), "{msg}");
    }

    #[test]
    fn serial_open_error_flags_permission_denied() {
        let err = serial_open_error("/dev/ttyS0", "Permission denied (os error 13)");
        let msg = format!("{err}");
        assert!(msg.contains("busy"), "{msg}");
    }

    #[test]
    fn serial_open_error_passes_through_other_failures() {
        let err = serial_open_error("COM9", "No such file or directory (os error 2)");
        let msg = format!("{err}");
        assert!(msg.contains("COM9"), "{msg}");
        assert!(!msg.contains("busy"), "{msg}");
        assert!(msg.contains("No such file or directory"), "{msg}");
    }
}
