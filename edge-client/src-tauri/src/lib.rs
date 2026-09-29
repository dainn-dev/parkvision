pub mod access;
pub mod anpr;
pub mod commands;
pub mod config;
pub mod fsm;
pub mod hal;
pub mod incidents;
pub mod mqtt;
pub mod payloads;
pub mod pipeline;
pub mod runtime;
pub mod store;
pub mod sync;
pub mod telemetry;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::anpr::PlateReading;
use crate::config::{ConfigStore, EdgeConfig, SharedConfigStore};
use crate::fsm::GateState;
use crate::hal::{BarrierHal, SimulatedHal};
use crate::runtime::{EdgeRuntime, SharedRuntime};
use crate::store::Store;
use crate::sync::SyncClient;

/// Managed runtime slot — `None` until provisioning completes.
pub type RuntimeState = Mutex<Option<Arc<SharedRuntime>>>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeStatus {
    pub gate_state: GateState,
    pub arm_angle_deg: u8,
    pub motor_temp_c: f32,
    pub loop_active: bool,
    pub ups_battery: u8,
    pub mqtt_connected: bool,
    pub whitelist_count: u64,
    pub outbox_depth: u64,
    pub last_plate: Option<String>,
    pub last_decision: Option<String>,
    pub last_reason: Option<String>,
    pub last_sync_at: Option<String>,
}

fn build_status(rt: &SharedRuntime) -> EdgeStatus {
    let sensors = rt.hal.sensors();
    let last = rt.last_event.lock().unwrap().clone();
    EdgeStatus {
        gate_state: rt.fsm.lock().unwrap().state(),
        arm_angle_deg: sensors.arm_angle_deg,
        motor_temp_c: sensors.motor_temp_c,
        loop_active: sensors.loop_active,
        ups_battery: sensors.ups_battery_pct,
        mqtt_connected: rt.publisher.is_connected(),
        whitelist_count: rt.store.whitelist_count().unwrap_or(0),
        outbox_depth: rt.store.pending_count().unwrap_or(0),
        last_plate: last.as_ref().and_then(|e| e["plate"].as_str().map(String::from)),
        last_decision: last.as_ref().and_then(|e| e["decision"].as_str().map(String::from)),
        last_reason: last.as_ref().and_then(|e| e["reason"].as_str().map(String::from)),
        last_sync_at: rt.store.kv_get("whitelist_synced_at").ok().flatten(),
    }
}

/// Spawn the UI event forwarders — `edge://status` on every gate-state or
/// connectivity transition, `edge://event` per access decision.
fn spawn_event_forwarders(app: &AppHandle, rt: &Arc<SharedRuntime>) {
    {
        let app = app.clone();
        let rt = rt.clone();
        let mut state_rx = rt.state_rx.clone();
        let mut conn_rx = rt.connected_rx.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::select! {
                    changed = state_rx.changed() => {
                        if changed.is_err() { break }
                    }
                    changed = conn_rx.changed() => {
                        if changed.is_err() { break }
                    }
                }
                let _ = app.emit("edge://status", build_status(&rt));
            }
        });
    }
    {
        let app = app.clone();
        let rt = rt.clone();
        let mut events = rt.events_rx();
        tauri::async_runtime::spawn(async move {
            while let Ok(ev) = events.recv().await {
                let _ = app.emit("edge://event", ev);
                // status fields (last_plate etc.) changed too
                let _ = app.emit("edge://status", build_status(&rt));
            }
        });
    }
}

/// Boot the edge runtime for a provisioned config. Idempotent — a running
/// runtime is stopped and replaced.
pub async fn boot_runtime(app: &AppHandle, cfg: EdgeConfig) -> anyhow::Result<()> {
    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    let store = Store::open(&app_data.join("edge.db"))?;
    let hal: Arc<dyn BarrierHal> = Arc::new(SimulatedHal::new());
    let rt = Arc::new(EdgeRuntime::start(cfg, store, hal, app_data).await?);

    let state = app.state::<RuntimeState>();
    let old = state.lock().unwrap().replace(rt.clone());
    if let Some(old) = old {
        old.stop().await;
    }
    spawn_event_forwarders(app, &rt);
    tracing::info!("edge runtime started");
    Ok(())
}

// ---------- Tauri commands ----------

#[tauri::command]
fn get_status(rt: State<'_, RuntimeState>) -> Option<EdgeStatus> {
    rt.lock().ok()?.as_ref().map(|r| build_status(r))
}

#[tauri::command]
fn manual_open(rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = rt.fsm.lock().unwrap().request_open();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
fn manual_close(rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = rt.fsm.lock().unwrap().request_close();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
fn manual_lock(rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    rt.fsm.lock().unwrap().lock();
    Ok(())
}

#[tauri::command]
fn manual_unlock(rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = rt.fsm.lock().unwrap().unlock();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
async fn manual_plate(plate: String, rt: State<'_, RuntimeState>) -> Result<(), String> {
    let tx = {
        let guard = rt.lock().map_err(|e| e.to_string())?;
        guard.as_ref().ok_or("runtime not provisioned")?.plate_tx.clone()
    };
    tx.send(PlateReading {
        plate,
        confidence: 1.0,
        plate_image_path: None,
        overview_image_path: None,
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resync(rt: State<'_, RuntimeState>) -> Result<String, String> {
    let rt = {
        let guard = rt.lock().map_err(|e| e.to_string())?;
        guard.as_ref().cloned().ok_or("runtime not provisioned")?
    };
    let client = SyncClient::new(rt.cfg.clone(), rt.store.clone());
    let w = client.sync_whitelist().await.map_err(|e| format!("whitelist: {e}"))?;
    let r = client.sync_rules().await.map_err(|e| format!("rules: {e}"))?;
    Ok(format!("{} vehicles / {} rules", w.upserted, r))
}

#[tauri::command]
async fn provision(
    cfg: EdgeConfig,
    app: AppHandle,
    cfg_store: State<'_, SharedConfigStore>,
    rt: State<'_, RuntimeState>,
) -> Result<(), String> {
    cfg.validate().map_err(|e| e.to_string())?;
    {
        let guard = cfg_store.lock().map_err(|e| e.to_string())?;
        let store = guard.as_ref().ok_or("config store unavailable")?;
        store.save(&cfg).map_err(|e| e.to_string())?;
    }
    // stop any existing runtime first so a bad boot doesn't lose the new config
    let old = rt.lock().map_err(|e| e.to_string())?.take();
    if let Some(old) = old {
        old.stop().await;
    }
    boot_runtime(&app, cfg).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let cfg_dir = app.path().app_config_dir()?;
            app.manage(SharedConfigStore::new(Some(ConfigStore::new(
                cfg_dir.join("edge-config.json"),
            ))));
            app.manage(RuntimeState::new(None));

            // boot automatically when a valid config already exists
            let store = ConfigStore::new(cfg_dir.join("edge-config.json"));
            if let Ok(Some(cfg)) = store.load() {
                let app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = boot_runtime(&app, cfg).await {
                        tracing::warn!("auto-boot failed: {e:#}");
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::save_config,
            provision,
            get_status,
            manual_open,
            manual_close,
            manual_lock,
            manual_unlock,
            manual_plate,
            resync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
