//! Tauri commands behind the barrier settings screen: enumerate COM ports,
//! probe a backend, fire one relay, read feedback inputs, list presets.
//! Each call builds a throw-away backend from the *unsaved* form config so
//! the technician can verify wiring before committing it.

use std::sync::Arc;

use serde::Serialize;

use super::config::{BarrierBrand, BarrierConfig};
use super::profiles::{all_presets, resolve_profile, BarrierProfile};
use super::relay::RelayBackend;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetOut {
    pub brand: BarrierBrand,
    pub profile: BarrierProfile,
}

pub fn presets() -> Vec<PresetOut> {
    all_presets()
        .into_iter()
        .map(|(brand, profile)| PresetOut { brand, profile })
        .collect()
}

/// Pulse `output` for the profile's pulse width on an already-built backend.
pub async fn test_output_with(
    backend: Arc<dyn RelayBackend>,
    cfg: &BarrierConfig,
    output: u8,
) -> anyhow::Result<()> {
    if output == 0 {
        anyhow::bail!("output index is 1-based");
    }
    backend.pulse(output, resolve_profile(cfg).pulse_ms).await
}

fn build(cfg: &BarrierConfig) -> Result<Arc<dyn RelayBackend>, String> {
    cfg.validate(resolve_profile(cfg).mode)
        .map_err(|e| format!("{e:#}"))?;
    super::backends::build(cfg).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_barrier_profiles() -> Vec<PresetOut> {
    presets()
}

#[tauri::command]
pub async fn barrier_probe(cfg: BarrierConfig) -> Result<String, String> {
    let backend = build(&cfg)?;
    backend.probe().await.map_err(|e| format!("{e:#}"))?;
    Ok(backend.kind().to_string())
}

#[tauri::command]
pub async fn barrier_test_output(cfg: BarrierConfig, output: u8) -> Result<(), String> {
    let backend = build(&cfg)?;
    test_output_with(backend, &cfg, output)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn barrier_read_inputs(cfg: BarrierConfig) -> Result<Option<Vec<bool>>, String> {
    let backend = build(&cfg)?;
    backend.read_inputs().await.map_err(|e| format!("{e:#}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hal::config::*;
    use crate::hal::mock::MockBackend;
    use std::time::Duration;

    #[tokio::test(start_paused = true)]
    async fn test_output_uses_profile_pulse() {
        let cfg = BarrierConfig {
            backend: RelayBackendConfig::ModbusTcp {
                host: "h".into(),
                port: 502,
                unit_id: 1,
            },
            brand: BarrierBrand::Bisen,
            outputs: OutputMap {
                open: 1,
                close: Some(2),
                stop: None,
                power: None,
            },
            inputs: None,
            overrides: ProfileOverrides {
                pulse_ms: Some(700),
                ..Default::default()
            },
        };
        let mock = Arc::new(MockBackend::new());
        test_output_with(mock.clone(), &cfg, 2).await.unwrap();
        let outs = mock.outputs.lock().unwrap().clone();
        assert_eq!((outs[0].0, outs[0].1), (2, true));
        assert_eq!((outs[1].0, outs[1].1), (2, false));
        assert!(outs[1].2 - outs[0].2 >= Duration::from_millis(700));
    }

    #[test]
    fn get_barrier_profiles_lists_seven() {
        let p = presets();
        assert_eq!(p.len(), 7);
        let json = serde_json::to_value(&p[0]).unwrap();
        assert!(json["profile"]["wiringHint"].is_string());
    }

    #[test]
    fn list_serial_ports_does_not_panic() {
        let _ = list_serial_ports();
    }
}
