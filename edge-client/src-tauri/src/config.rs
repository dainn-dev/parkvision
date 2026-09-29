//! Provisioning config v2: shared tenant/device/API identity + a list of
//! gate bindings (`gates[]` — gate/lane/direction/cameras each). Persisted
//! as JSON under the app config dir; `load` migrates the flat v1 shape.
//! The API key is redacted in `Debug` output.
//!
//! `GateCtx` is the per-gate runtime view — it mirrors the field names the
//! single-gate v1 modules were written against (`gate_id`, `lane_direction`,
//! `camera_rtsp_url`, …) so commands/pipeline/incidents/telemetry consume it
//! unchanged.

use std::fmt;
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CONFIG_VERSION: u32 = 2;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MqttConfig {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub tls: bool,
}

/// One camera bound to a gate — mirrors backend `cameras` rows.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CameraBinding {
    pub camera_id: Uuid,
    /// "plate" | "overview" — the ANPR source uses the first plate camera.
    pub purpose: String,
    pub stream_url: String,
}

/// One barrier gate this device operates — a site may hand one edge client
/// both the entry and exit gate (small-tenant "nhà trọ" topology).
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateBinding {
    pub gate_id: Uuid,
    pub lane_id: Option<Uuid>,
    pub direction: String,
    #[serde(default)]
    pub cameras: Vec<CameraBinding>,
}

impl GateBinding {
    /// Stream URL of the first plate-purpose camera, falling back to the
    /// first camera of any purpose.
    pub fn plate_stream(&self) -> Option<&str> {
        self.cameras
            .iter()
            .find(|c| c.purpose == "plate")
            .or_else(|| self.cameras.first())
            .map(|c| c.stream_url.as_str())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EdgeConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    pub tenant_id: Uuid,
    pub site_id: Uuid,
    pub device_id: Uuid,
    pub api_key: String,
    pub api_base_url: String,
    pub mqtt: MqttConfig,
    pub gates: Vec<GateBinding>,
}

fn default_version() -> u32 {
    CONFIG_VERSION
}

/// Per-gate runtime context — same field names the single-gate modules use.
#[derive(Clone)]
pub struct GateCtx {
    pub tenant_id: Uuid,
    pub site_id: Uuid,
    pub device_id: Uuid,
    pub gate_id: Uuid,
    pub lane_id: Option<Uuid>,
    pub lane_direction: String,
    pub camera_rtsp_url: Option<String>,
    pub cameras: Vec<CameraBinding>,
}

impl fmt::Debug for GateCtx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GateCtx")
            .field("gate_id", &self.gate_id)
            .field("lane_id", &self.lane_id)
            .field("lane_direction", &self.lane_direction)
            .field(
                "camera_rtsp_url",
                &self.camera_rtsp_url.as_ref().map(|_| "***"),
            )
            .field("cameras", &self.cameras.len())
            .finish()
    }
}

impl EdgeConfig {
    /// Runtime view for one gate binding.
    pub fn gate_ctx(&self, gate: &GateBinding) -> GateCtx {
        GateCtx {
            tenant_id: self.tenant_id,
            site_id: self.site_id,
            device_id: self.device_id,
            gate_id: gate.gate_id,
            lane_id: gate.lane_id,
            lane_direction: gate.direction.clone(),
            camera_rtsp_url: gate.plate_stream().map(str::to_string),
            cameras: gate.cameras.clone(),
        }
    }

    pub fn gate(&self, gate_id: &Uuid) -> Option<&GateBinding> {
        self.gates.iter().find(|g| &g.gate_id == gate_id)
    }

    pub fn validate(&self) -> Result<()> {
        if self.gates.is_empty() {
            bail!("at least one gate binding is required");
        }
        for g in &self.gates {
            if !matches!(g.direction.as_str(), "entry" | "exit") {
                bail!("gate direction must be 'entry' or 'exit' (lowercase)");
            }
        }
        if self.api_key.trim().is_empty() {
            bail!("api_key is required");
        }
        if self.api_base_url.trim().is_empty() {
            bail!("api_base_url is required");
        }
        if self.mqtt.host.trim().is_empty() {
            bail!("mqtt.host is required");
        }
        Ok(())
    }
}

impl fmt::Debug for EdgeConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EdgeConfig")
            .field("version", &self.version)
            .field("tenant_id", &self.tenant_id)
            .field("site_id", &self.site_id)
            .field("device_id", &self.device_id)
            .field("api_key", &"***")
            .field("api_base_url", &self.api_base_url)
            .field("mqtt", &self.mqtt)
            .field("gates", &self.gates.len())
            .finish()
    }
}

impl fmt::Debug for MqttConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MqttConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("username", &self.username)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("tls", &self.tls)
            .finish()
    }
}

// ---------- v1 migration ----------

/// The pre-activation flat shape — single gate, inline camera URL.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeConfigV1 {
    tenant_id: Uuid,
    site_id: Uuid,
    gate_id: Uuid,
    lane_id: Option<Uuid>,
    device_id: Uuid,
    api_key: String,
    api_base_url: String,
    mqtt: MqttConfig,
    #[serde(default = "default_direction_v1")]
    lane_direction: String,
    camera_rtsp_url: Option<String>,
}

fn default_direction_v1() -> String {
    "entry".to_string()
}

impl EdgeConfigV1 {
    fn into_v2(self) -> EdgeConfig {
        let cameras = self
            .camera_rtsp_url
            .map(|url| {
                vec![CameraBinding {
                    camera_id: Uuid::nil(),
                    purpose: "plate".to_string(),
                    stream_url: url,
                }]
            })
            .unwrap_or_default();
        EdgeConfig {
            version: CONFIG_VERSION,
            tenant_id: self.tenant_id,
            site_id: self.site_id,
            device_id: self.device_id,
            api_key: self.api_key,
            api_base_url: self.api_base_url,
            mqtt: self.mqtt,
            gates: vec![GateBinding {
                gate_id: self.gate_id,
                lane_id: self.lane_id,
                direction: self.lane_direction,
                cameras,
            }],
        }
    }
}

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Load the persisted config; a missing `version` field means the flat
    /// v1 shape, which is migrated to v2 (and re-written on next `save`).
    pub fn load(&self) -> Result<Option<EdgeConfig>> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e).context("read config"),
        };
        let value: serde_json::Value = serde_json::from_str(&raw).context("parse config")?;
        let cfg = if value.get("version").is_none() {
            serde_json::from_value::<EdgeConfigV1>(value)
                .context("parse v1 config")?
                .into_v2()
        } else {
            serde_json::from_value::<EdgeConfig>(value).context("parse config")?
        };
        Ok(Some(cfg))
    }

    pub fn save(&self, cfg: &EdgeConfig) -> Result<()> {
        cfg.validate()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).context("create config dir")?;
        }
        let body = serde_json::to_string_pretty(cfg).context("serialize config")?;
        fs::write(&self.path, body).context("write config")?;
        Ok(())
    }

    /// Remove the persisted config (tenant revoked the token — the app must
    /// re-activate before it can run again).
    pub fn clear(&self) -> Result<()> {
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e).context("remove config"),
        }
    }
}

// ---------- Tauri commands ----------

pub type SharedConfigStore = std::sync::Mutex<Option<ConfigStore>>;

#[tauri::command]
pub fn get_config(store: tauri::State<'_, SharedConfigStore>) -> Option<EdgeConfig> {
    store
        .lock()
        .ok()?
        .as_ref()
        .and_then(|s| s.load().ok().flatten())
}

#[tauri::command]
pub fn save_config(
    cfg: EdgeConfig,
    store: tauri::State<'_, SharedConfigStore>,
) -> Result<(), String> {
    let guard = store
        .lock()
        .map_err(|_| "config store poisoned".to_string())?;
    let s = guard
        .as_ref()
        .ok_or_else(|| "config store not initialized".to_string())?;
    s.save(&cfg).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_config() -> EdgeConfig {
        EdgeConfig {
            version: CONFIG_VERSION,
            tenant_id: Uuid::new_v4(),
            site_id: Uuid::new_v4(),
            device_id: Uuid::new_v4(),
            api_key: "pk_test_secret".to_string(),
            api_base_url: "https://api.example.com".to_string(),
            mqtt: MqttConfig {
                host: "mqtt.example.com".to_string(),
                port: 8883,
                username: Some("edge-a".to_string()),
                password: Some("pw".to_string()),
                tls: true,
            },
            gates: vec![
                GateBinding {
                    gate_id: Uuid::new_v4(),
                    lane_id: Some(Uuid::new_v4()),
                    direction: "entry".to_string(),
                    cameras: vec![CameraBinding {
                        camera_id: Uuid::new_v4(),
                        purpose: "plate".to_string(),
                        stream_url: "rtsp://cam-entry".to_string(),
                    }],
                },
                GateBinding {
                    gate_id: Uuid::new_v4(),
                    lane_id: Some(Uuid::new_v4()),
                    direction: "exit".to_string(),
                    cameras: vec![CameraBinding {
                        camera_id: Uuid::new_v4(),
                        purpose: "plate".to_string(),
                        stream_url: "rtsp://cam-exit".to_string(),
                    }],
                },
            ],
        }
    }

    #[test]
    fn save_then_load_returns_identical_config() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let cfg = sample_config();
        store.save(&cfg).unwrap();
        let loaded = store.load().unwrap().expect("config should exist");
        assert_eq!(
            serde_json::to_value(&cfg).unwrap(),
            serde_json::to_value(&loaded).unwrap()
        );
        assert_eq!(loaded.gates.len(), 2);
    }

    #[test]
    fn v1_flat_config_migrates_to_single_gate_v2() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("edge-config.json");
        let gate = Uuid::new_v4();
        let lane = Uuid::new_v4();
        fs::write(
            &path,
            serde_json::to_string(&json!({
                "tenantId": Uuid::new_v4(),
                "siteId": Uuid::new_v4(),
                "gateId": gate,
                "laneId": lane,
                "deviceId": Uuid::new_v4(),
                "apiKey": "pk_old",
                "apiBaseUrl": "http://localhost:8000",
                "mqtt": {"host": "localhost", "port": 1883, "username": null,
                         "password": null, "tls": false},
                "laneDirection": "exit",
                "cameraRtspUrl": "rtsp://old-cam"
            }))
            .unwrap(),
        )
        .unwrap();
        let cfg = ConfigStore::new(path).load().unwrap().unwrap();
        assert_eq!(cfg.version, CONFIG_VERSION);
        assert_eq!(cfg.gates.len(), 1);
        assert_eq!(cfg.gates[0].gate_id, gate);
        assert_eq!(cfg.gates[0].lane_id, Some(lane));
        assert_eq!(cfg.gates[0].direction, "exit");
        assert_eq!(cfg.gates[0].cameras.len(), 1);
        assert_eq!(cfg.gates[0].cameras[0].stream_url, "rtsp://old-cam");
    }

    #[test]
    fn gate_ctx_carries_plate_camera_and_direction() {
        let cfg = sample_config();
        let ctx = cfg.gate_ctx(&cfg.gates[0]);
        assert_eq!(ctx.gate_id, cfg.gates[0].gate_id);
        assert_eq!(ctx.lane_direction, "entry");
        assert_eq!(ctx.camera_rtsp_url.as_deref(), Some("rtsp://cam-entry"));
        assert_eq!(ctx.tenant_id, cfg.tenant_id);
    }

    #[test]
    fn load_on_missing_file_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn empty_gates_fail_validation() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let mut cfg = sample_config();
        cfg.gates.clear();
        assert!(store.save(&cfg).is_err());
    }

    #[test]
    fn uppercase_direction_fails_validation() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let mut cfg = sample_config();
        cfg.gates[0].direction = "ENTRY".to_string();
        assert!(store.save(&cfg).is_err());
    }

    #[test]
    fn api_key_is_redacted_in_debug() {
        let cfg = sample_config();
        let dbg = format!("{cfg:?}");
        assert!(!dbg.contains("pk_test_secret"));
        assert!(!dbg.contains("rtsp://cam-entry"));
        assert!(dbg.contains("***"));
    }
}
