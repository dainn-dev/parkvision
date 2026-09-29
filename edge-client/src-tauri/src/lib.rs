pub mod access;
pub mod activation;
pub mod anpr;
pub mod camera_worker;
pub mod commands;
pub mod config;
pub mod fsm;
pub mod hal;
pub mod incidents;
pub mod ingest;
pub mod lock;
pub mod mqtt;
pub mod payloads;
pub mod pipeline;
pub mod runtime;
pub mod store;
pub mod sync;
pub mod telemetry;
pub mod worker_ipc;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::anpr::PlateReading;
use crate::config::{ConfigStore, EdgeConfig, SharedConfigStore};
use crate::fsm::GateState;
use crate::hal::{BarrierHal, SimulatedHal};
use crate::runtime::{EdgeRuntime, GateRuntime, SharedRuntime};
use crate::store::Store;
use crate::sync::SyncClient;

/// Managed runtime slot — `None` until provisioning completes.
pub type RuntimeState = Mutex<Option<Arc<SharedRuntime>>>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateStatus {
    pub gate_id: Uuid,
    pub direction: String,
    pub gate_state: GateState,
    pub arm_angle_deg: u8,
    pub motor_temp_c: f32,
    pub loop_active: bool,
    pub ups_battery: u8,
    pub last_plate: Option<String>,
    pub last_decision: Option<String>,
    pub last_reason: Option<String>,
}

/// Device-level status + one `GateStatus` per bound gate — the operator UI
/// renders entry/exit panels in parallel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeStatus {
    pub mqtt_connected: bool,
    pub whitelist_count: u64,
    pub outbox_depth: u64,
    pub last_sync_at: Option<String>,
    pub gates: Vec<GateStatus>,
}

fn gate_status(g: &GateRuntime) -> GateStatus {
    let sensors = g.hal.sensors();
    let last = g.last_event.lock().unwrap().clone();
    GateStatus {
        gate_id: g.ctx.gate_id,
        direction: g.ctx.lane_direction.clone(),
        gate_state: g.fsm.lock().unwrap().state(),
        arm_angle_deg: sensors.arm_angle_deg,
        motor_temp_c: sensors.motor_temp_c,
        loop_active: sensors.loop_active,
        ups_battery: sensors.ups_battery_pct,
        last_plate: last
            .as_ref()
            .and_then(|e| e["plate"].as_str().map(String::from)),
        last_decision: last
            .as_ref()
            .and_then(|e| e["decision"].as_str().map(String::from)),
        last_reason: last
            .as_ref()
            .and_then(|e| e["reason"].as_str().map(String::from)),
    }
}

fn build_status(rt: &SharedRuntime) -> EdgeStatus {
    EdgeStatus {
        mqtt_connected: rt.publisher.is_connected(),
        whitelist_count: rt.store.whitelist_count().unwrap_or(0),
        outbox_depth: rt.store.pending_count().unwrap_or(0),
        last_sync_at: rt.store.kv_get("whitelist_synced_at").ok().flatten(),
        gates: rt.gates.iter().map(|g| gate_status(g)).collect(),
    }
}

/// Spawn the UI event forwarders — `edge://status` on every gate-state or
/// connectivity transition, `edge://event` per access decision.
fn spawn_event_forwarders(app: &AppHandle, rt: &Arc<SharedRuntime>) {
    {
        let app = app.clone();
        let rt = rt.clone();
        let mut conn_rx = rt.connected_rx.clone();
        let mut state_rxs: Vec<_> = rt.gates.iter().map(|g| g.state_rx.clone()).collect();
        tauri::async_runtime::spawn(async move {
            loop {
                // watch for a change on connectivity or any gate's state
                let conn = conn_rx.changed();
                let gate = async {
                    for rx in state_rxs.iter_mut() {
                        if rx.has_changed().unwrap_or(false) {
                            let _ = rx.borrow_and_update();
                            return;
                        }
                    }
                    futures::future::pending::<()>().await;
                };
                tokio::select! {
                    changed = conn => {
                        if changed.is_err() { break }
                    }
                    _ = gate => {}
                    _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {}
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
                let _ = app.emit("edge://status", build_status(&rt));
            }
        });
    }
    {
        let app = app.clone();
        let mut camera = rt.camera_rx();
        tauri::async_runtime::spawn(async move {
            loop {
                match camera.recv().await {
                    Ok(ev) => {
                        let _ = app.emit("edge://camera", ev);
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
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
    let hal_factory = |_binding: &crate::config::GateBinding| -> Arc<dyn BarrierHal> {
        Arc::new(SimulatedHal::new())
    };
    let rt = Arc::new(EdgeRuntime::start(cfg, store, &hal_factory, app_data).await?);

    let state = app.state::<RuntimeState>();
    let old = state.lock().unwrap().replace(rt.clone());
    if let Some(old) = old {
        old.stop().await;
    }
    spawn_event_forwarders(app, &rt);
    // revocation watcher — sync loop flips revoked_rx on 401/403
    {
        let app = app.clone();
        let mut revoked = rt.revoked_rx.clone();
        tauri::async_runtime::spawn(async move {
            if revoked.changed().await.is_ok() && *revoked.borrow() {
                crate::activation::handle_revoked(&app).await;
            }
        });
    }
    tracing::info!("edge runtime started ({} gates)", rt.gates.len());
    Ok(())
}

fn gate_for(rt: &SharedRuntime, gate_id: Option<Uuid>) -> Result<&Arc<GateRuntime>, String> {
    match gate_id {
        Some(id) => rt.gate(&id).ok_or_else(|| "unknown gate".to_string()),
        None => rt
            .primary()
            .ok_or_else(|| "runtime has no gates".to_string()),
    }
}

// ---------- Tauri commands ----------

#[tauri::command]
fn get_status(rt: State<'_, RuntimeState>) -> Option<EdgeStatus> {
    rt.lock().ok()?.as_ref().map(|r| build_status(r))
}

#[tauri::command]
fn manual_open(gate_id: Option<Uuid>, rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = gate_for(rt, gate_id)?.fsm.lock().unwrap().request_open();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
fn manual_close(gate_id: Option<Uuid>, rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = gate_for(rt, gate_id)?.fsm.lock().unwrap().request_close();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
fn manual_lock(gate_id: Option<Uuid>, rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    gate_for(rt, gate_id)?.fsm.lock().unwrap().lock();
    Ok(())
}

#[tauri::command]
fn manual_unlock(gate_id: Option<Uuid>, rt: State<'_, RuntimeState>) -> Result<(), String> {
    let guard = rt.lock().map_err(|e| e.to_string())?;
    let rt = guard.as_ref().ok_or("runtime not provisioned")?;
    let res = gate_for(rt, gate_id)?.fsm.lock().unwrap().unlock();
    res.map_err(|r| r.as_str().to_string())
}

#[tauri::command]
async fn manual_plate(
    plate: String,
    gate_id: Option<Uuid>,
    rt: State<'_, RuntimeState>,
) -> Result<(), String> {
    let tx = {
        let guard = rt.lock().map_err(|e| e.to_string())?;
        let rt = guard.as_ref().ok_or("runtime not provisioned")?;
        gate_for(rt, gate_id)?.plate_tx.clone()
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
    let w = client
        .sync_whitelist()
        .await
        .map_err(|e| format!("whitelist: {e}"))?;
    let r = client
        .sync_rules()
        .await
        .map_err(|e| format!("rules: {e}"))?;
    Ok(format!("{} vehicles / {} rules", w.upserted, r))
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
            let lock_store = lock::LockStore::new(cfg_dir.join("edge-lock.json"));
            let locked = lock_store.is_enabled();
            app.manage(lock::SharedLock::new(Some(lock::LockState {
                store: lock_store,
                locked,
            })));

            // boot automatically when a valid config already exists — the
            // runtime refreshes /edge/config first and deprovisions itself
            // if the tenant revoked the credential.
            let store = ConfigStore::new(cfg_dir.join("edge-config.json"));
            if let Ok(Some(cfg)) = store.load() {
                let app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::activation::refresh_and_boot(&app, cfg).await {
                        tracing::warn!("auto-boot failed: {e:#}");
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::save_config,
            activation::activate,
            activation::deprovision,
            activation::detect_public_ip,
            activation::device_ip,
            lock::set_lock_password,
            lock::unlock,
            lock::lock_now,
            lock::lock_status,
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
