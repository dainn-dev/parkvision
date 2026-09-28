//! Provisioning config: tenant/site/gate/device identity, MQTT + REST
//! credentials. Persisted as JSON under the app config dir; `save` validates
//! before writing. The API key is redacted in `Debug` output.

use std::fmt;
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EdgeConfig {
    pub tenant_id: Uuid,
    pub site_id: Uuid,
    pub gate_id: Uuid,
    pub lane_id: Option<Uuid>,
    pub device_id: Uuid,
    pub api_key: String,
    pub api_base_url: String,
    pub mqtt: MqttConfig,
    #[serde(default = "default_direction")]
    pub lane_direction: String,
    pub camera_rtsp_url: Option<String>,
}

fn default_direction() -> String {
    "entry".to_string()
}

impl EdgeConfig {
    pub fn validate(&self) -> Result<()> {
        if !matches!(self.lane_direction.as_str(), "entry" | "exit") {
            bail!("lane_direction must be 'entry' or 'exit' (lowercase)");
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
            .field("tenant_id", &self.tenant_id)
            .field("site_id", &self.site_id)
            .field("gate_id", &self.gate_id)
            .field("lane_id", &self.lane_id)
            .field("device_id", &self.device_id)
            .field("api_key", &"***")
            .field("api_base_url", &self.api_base_url)
            .field("mqtt", &self.mqtt)
            .field("lane_direction", &self.lane_direction)
            .field("camera_rtsp_url", &self.camera_rtsp_url)
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

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Result<Option<EdgeConfig>> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e).context("read config"),
        };
        let cfg: EdgeConfig = serde_json::from_str(&raw).context("parse config")?;
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

    fn sample_config() -> EdgeConfig {
        EdgeConfig {
            tenant_id: Uuid::new_v4(),
            site_id: Uuid::new_v4(),
            gate_id: Uuid::new_v4(),
            lane_id: Some(Uuid::new_v4()),
            device_id: Uuid::new_v4(),
            api_key: "pvk_test_secret".to_string(),
            api_base_url: "https://api.example.com".to_string(),
            mqtt: MqttConfig {
                host: "mqtt.example.com".to_string(),
                port: 8883,
                username: Some("edge-a".to_string()),
                password: Some("pw".to_string()),
                tls: true,
            },
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
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
    }

    #[test]
    fn load_on_missing_file_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn uppercase_direction_fails_validation() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let mut cfg = sample_config();
        cfg.lane_direction = "ENTRY".to_string();
        assert!(store.save(&cfg).is_err());
    }

    #[test]
    fn api_key_is_redacted_in_debug() {
        let cfg = sample_config();
        let dbg = format!("{cfg:?}");
        assert!(!dbg.contains("pvk_test_secret"));
        assert!(dbg.contains("***"));
    }
}
