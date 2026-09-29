//! Device activation: redeem a tenant-issued one-time code for a config
//! bundle (`POST /edge/activate`), refresh it on boot (`GET /edge/config`),
//! and deprovision when the tenant revokes the credential.
//!
//! The bundle's `api.token` / `mqtt.password` are only present in the
//! activate response — `refresh` reuses the persisted key and never re-sees
//! it. Secrets are kept out of logs and error strings.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::config::{
    CameraBinding, ConfigStore, EdgeConfig, GateBinding, MqttConfig, SharedConfigStore,
    CONFIG_VERSION,
};
use crate::runtime::SharedRuntime;
use crate::RuntimeState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CameraOut {
    id: Uuid,
    purpose: String,
    stream_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GateOut {
    gate_id: Uuid,
    lane_id: Option<Uuid>,
    direction: String,
    cameras: Vec<CameraOut>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiOut {
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MqttOut {
    host: String,
    port: u16,
    tls: bool,
    username: String,
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleOut {
    device_id: Uuid,
    tenant_id: Uuid,
    site_id: Uuid,
    gates: Vec<GateOut>,
    api: ApiOut,
    mqtt: MqttOut,
}

/// Whether a GET /edge/config response means the credential is dead.
pub fn is_revoked(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN
}

fn bundle_to_config(
    bundle: &BundleOut,
    api_base_url: &str,
    existing_key: Option<String>,
) -> Result<EdgeConfig> {
    let token = bundle
        .api
        .token
        .clone()
        .or(existing_key)
        .context("config bundle has no token and none is persisted")?;
    Ok(EdgeConfig {
        version: CONFIG_VERSION,
        tenant_id: bundle.tenant_id,
        site_id: bundle.site_id,
        device_id: bundle.device_id,
        api_key: token.clone(),
        api_base_url: api_base_url.trim_end_matches('/').to_string(),
        mqtt: MqttConfig {
            host: bundle.mqtt.host.clone(),
            port: bundle.mqtt.port,
            username: Some(bundle.mqtt.username.clone()),
            password: Some(bundle.mqtt.password.clone().unwrap_or(token)),
            tls: bundle.mqtt.tls,
        },
        gates: bundle
            .gates
            .iter()
            .map(|g| GateBinding {
                gate_id: g.gate_id,
                lane_id: g.lane_id,
                direction: g.direction.clone(),
                cameras: g
                    .cameras
                    .iter()
                    .map(|c| CameraBinding {
                        camera_id: c.id,
                        purpose: c.purpose.clone(),
                        stream_url: c.stream_url.clone(),
                    })
                    .collect(),
            })
            .collect(),
    })
}

fn config_store(app: &AppHandle) -> Result<ConfigStore> {
    Ok(ConfigStore::new(
        app.path()
            .app_config_dir()
            .context("app_config_dir")?
            .join("edge-config.json"),
    ))
}

/// Refresh the persisted bundle from `GET /edge/config`, then boot.
/// 401/403 → the tenant revoked us: clear config and surface
/// `edge://deprovisioned`. Network failure → boot the cached config so the
/// gate keeps working offline.
pub async fn refresh_and_boot(app: &AppHandle, cfg: EdgeConfig) -> Result<()> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let url = format!("{}/edge/config", cfg.api_base_url.trim_end_matches('/'));
    match http
        .get(&url)
        .header("X-Api-Key", &cfg.api_key)
        .send()
        .await
    {
        Ok(resp) if is_revoked(resp.status()) => {
            tracing::warn!("device credential revoked — deprovisioning");
            deprovision_inner(app).await?;
            bail!("credential revoked")
        }
        Ok(resp) if resp.status().is_success() => {
            let bundle: BundleOut = resp.json().await.context("config body decode")?;
            let merged = bundle_to_config(&bundle, &cfg.api_base_url, Some(cfg.api_key.clone()))?;
            if serde_json::to_value(&merged)? != serde_json::to_value(&cfg)? {
                config_store(app)?.save(&merged)?;
                tracing::info!("config refreshed from backend");
            }
            return crate::boot_runtime(app, merged).await;
        }
        Ok(resp) => {
            tracing::warn!(
                "config refresh HTTP {} — booting cached config",
                resp.status()
            );
        }
        Err(e) => {
            tracing::warn!("config refresh unreachable ({e:#}) — booting cached config");
        }
    }
    crate::boot_runtime(app, cfg).await
}

/// Stop the runtime, wipe the persisted config, and tell the UI to return
/// to the activation screen.
async fn deprovision_inner(app: &AppHandle) -> Result<()> {
    let old = app
        .state::<RuntimeState>()
        .lock()
        .map_err(|_| anyhow::anyhow!("runtime state poisoned"))?
        .take();
    if let Some(rt) = old {
        rt.stop().await;
    }
    config_store(app)?.clear()?;
    let _ = app.emit("edge://deprovisioned", ());
    Ok(())
}

/// Revocation signal from the runtime's sync loop — called by the
/// `revoked_rx` watcher in the Tauri layer.
pub async fn handle_revoked(app: &AppHandle) {
    if let Err(e) = deprovision_inner(app).await {
        tracing::error!("deprovision failed: {e:#}");
    }
}

// ---------- Tauri commands ----------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateArgs {
    pub api_base_url: String,
    pub code: String,
    pub device_info: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn activate(
    args: ActivateArgs,
    app: AppHandle,
    cfg_store: tauri::State<'_, SharedConfigStore>,
) -> Result<(), String> {
    let base = args.api_base_url.trim_end_matches('/');
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = http
        .post(format!("{base}/edge/activate"))
        .json(&serde_json::json!({
            "code": args.code,
            "deviceInfo": args.device_info.unwrap_or(serde_json::json!({})),
        }))
        .send()
        .await
        .map_err(|e| format!("cannot reach server: {e}"))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("invalid activation code".to_string());
    }
    if resp.status() == reqwest::StatusCode::GONE {
        return Err("activation code expired".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("activation failed (HTTP {})", resp.status()));
    }
    let bundle: BundleOut = resp
        .json()
        .await
        .map_err(|e| format!("bad activation response: {e}"))?;
    let cfg = bundle_to_config(&bundle, base, None).map_err(|e| e.to_string())?;
    cfg.validate().map_err(|e| e.to_string())?;

    {
        let guard = cfg_store.lock().map_err(|e| e.to_string())?;
        let store = guard.as_ref().ok_or("config store unavailable")?;
        store.save(&cfg).map_err(|e| e.to_string())?;
    }
    let old = app
        .state::<RuntimeState>()
        .lock()
        .map_err(|e| e.to_string())?
        .take();
    if let Some(rt) = old {
        rt.stop().await;
    }
    crate::boot_runtime(&app, cfg)
        .await
        .map_err(|e| e.to_string())
}

/// This device's primary local IP — the address of the interface the OS
/// uses for outbound traffic. Shown in the app's corner badge. NOT the
/// address the server sees (that's `detect_public_ip`), so it cannot be
/// used for `allowedIp` pinning.
#[tauri::command]
pub fn device_ip() -> Option<String> {
    local_ip_address::local_ip().ok().map(|ip| ip.to_string())
}

/// Fetch the public IP the backend sees for this device — the operator
/// reports this to the tenant admin so they can pin `allowedIp` on the
/// activation code.
#[tauri::command]
pub async fn detect_public_ip(api_base_url: String) -> Result<String, String> {
    let base = api_base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("server URL is empty".to_string());
    }
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = http
        .get(format!("{base}/edge/client-ip"))
        .send()
        .await
        .map_err(|e| format!("cannot reach server: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("client-ip request failed (HTTP {})", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["ip"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "bad client-ip response".to_string())
}

/// Manual "log out" — wipes the config and stops the runtime.
#[tauri::command]
pub async fn deprovision(app: AppHandle) -> Result<(), String> {
    deprovision_inner(&app).await.map_err(|e| e.to_string())
}

/// Watcher helper — `true` once the runtime detected a revoked credential.
pub fn revoked_watcher(rt: &SharedRuntime) -> tokio::sync::watch::Receiver<bool> {
    rt.revoked_rx.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle_json() -> serde_json::Value {
        serde_json::json!({
            "deviceId": "44444444-4444-4444-4444-444444444444",
            "tenantId": "11111111-1111-1111-1111-111111111111",
            "siteId": "22222222-2222-2222-2222-222222222222",
            "gates": [{
                "gateId": "33333333-3333-3333-3333-333333333333",
                "laneId": "55555555-5555-5555-5555-555555555555",
                "direction": "entry",
                "name": "Gate A",
                "cameras": [{
                    "id": "77777777-7777-7777-7777-777777777777",
                    "name": "Plate cam",
                    "streamUrl": "rtsp://cam1",
                    "purpose": "plate"
                }]
            }],
            "api": {"token": "pk_abc", "tokenStatus": "active"},
            "mqtt": {"host": "mqtt.local", "port": 1883, "tls": false,
                     "username": "edge-4444", "password": "pk_abc"}
        })
    }

    #[test]
    fn bundle_maps_to_v2_config() {
        let bundle: BundleOut = serde_json::from_value(bundle_json()).unwrap();
        let cfg = bundle_to_config(&bundle, "http://api:8000/", None).unwrap();
        assert_eq!(cfg.version, 2);
        assert_eq!(cfg.api_key, "pk_abc");
        assert_eq!(cfg.api_base_url, "http://api:8000");
        assert_eq!(cfg.mqtt.username.as_deref(), Some("edge-4444"));
        assert_eq!(cfg.gates.len(), 1);
        assert_eq!(cfg.gates[0].cameras.len(), 1);
        cfg.validate().unwrap();
    }

    #[test]
    fn refresh_bundle_without_token_keeps_persisted_key() {
        let mut v = bundle_json();
        v["api"]["token"] = serde_json::Value::Null;
        v["mqtt"]["password"] = serde_json::Value::Null;
        let bundle: BundleOut = serde_json::from_value(v).unwrap();
        let cfg = bundle_to_config(&bundle, "http://api", Some("pk_persisted".into())).unwrap();
        assert_eq!(cfg.api_key, "pk_persisted");
        assert_eq!(cfg.mqtt.password.as_deref(), Some("pk_persisted"));
    }

    #[test]
    fn refresh_without_any_token_fails() {
        let mut v = bundle_json();
        v["api"]["token"] = serde_json::Value::Null;
        let bundle: BundleOut = serde_json::from_value(v).unwrap();
        assert!(bundle_to_config(&bundle, "http://api", None).is_err());
    }

    #[test]
    fn revoked_statuses() {
        assert!(is_revoked(reqwest::StatusCode::UNAUTHORIZED));
        assert!(is_revoked(reqwest::StatusCode::FORBIDDEN));
        assert!(!is_revoked(reqwest::StatusCode::OK));
        assert!(!is_revoked(reqwest::StatusCode::INTERNAL_SERVER_ERROR));
    }
}
