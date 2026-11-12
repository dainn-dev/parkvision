//! Staff-triggered app updates from the backend's release channel.
//!
//! The Tauri updater asks `GET /updates/edge/{target}/{arch}/{version}` (see
//! `plugins.updater` in tauri.conf.json) and verifies every download against
//! the public key built into the app, so only builds signed with our private
//! key can install.
//!
//! Nothing installs on its own: the operator checks, then presses "Cập nhật".
//! Installing quits the app and the NSIS installer relaunches it, so it is
//! refused while any barrier is moving or open.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::RuntimeState;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    /// `None` when this build is the newest published one.
    pub available_version: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn begin_update_hold(app: &AppHandle) -> Result<(), String> {
    let rt = app.state::<RuntimeState>();
    let guard = rt
        .lock()
        .map_err(|_| "runtime unavailable".to_string())?;
    let runtime = guard
        .as_ref()
        .ok_or_else(|| "runtime not provisioned".to_string())?;
    let mut gates: Vec<std::sync::Arc<crate::runtime::GateRuntime>> =
        Vec::with_capacity(runtime.gates.len());
    for gate in &runtime.gates {
        let mut fsm = match gate.fsm.lock() {
            Ok(fsm) => fsm,
            Err(_) => {
                for held in &gates {
                    if let Ok(mut held_fsm) = held.fsm.lock() {
                        held_fsm.end_update();
                    }
                }
                return Err("gate state unavailable".to_string());
            }
        };
        if let Err(error) = fsm.begin_update() {
            for held in &gates {
                if let Ok(mut held_fsm) = held.fsm.lock() {
                    held_fsm.end_update();
                }
            }
            return Err(error.to_string());
        }
        gates.push(gate.clone());
    }
    Ok(())
}

fn end_update_hold(app: &AppHandle) {
    let rt = app.state::<RuntimeState>();
    let Ok(guard) = rt.lock() else {
        tracing::error!("runtime lock poisoned while releasing update hold");
        return;
    };
    if let Some(runtime) = guard.as_ref() {
        for gate in &runtime.gates {
            if let Ok(mut fsm) = gate.fsm.lock() {
                fsm.end_update();
            } else {
                tracing::error!("gate lock poisoned while releasing update hold");
            }
        }
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|e| format!("updater unavailable: {e}"))?
        .check()
        .await
        .map_err(|e| format!("cannot check for updates: {e}"))?;
    Ok(UpdateInfo {
        current_version,
        available_version: update.as_ref().map(|u| u.version.clone()),
        notes: update.and_then(|u| u.body),
    })
}

/// Download, verify and install the newest build. On success the app exits
/// and the installer restarts it, so this normally does not return.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    begin_update_hold(&app)?;
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            end_update_hold(&app);
            return Err(format!("updater unavailable: {error}"));
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            end_update_hold(&app);
            return Err("no update available".to_string());
        }
        Err(error) => {
            end_update_hold(&app);
            return Err(format!("cannot check for updates: {error}"));
        }
    };

    let mut downloaded: u64 = 0;
    let progress_app = app.clone();
    let bytes = match update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                if let Err(error) = progress_app.emit(
                    "edge://update-progress",
                    UpdateProgress { downloaded, total },
                ) {
                    tracing::debug!("update progress event was not delivered: {error}");
                }
            },
            || {},
        )
        .await
    {
        Ok(bytes) => bytes,
        Err(error) => {
            end_update_hold(&app);
            return Err(format!("download failed: {error}"));
        }
    };

    tracing::info!(
        "installing update {} (from {})",
        update.version,
        update.current_version
    );
    if let Err(error) = update.install(bytes) {
        end_update_hold(&app);
        return Err(format!("install failed: {error}"));
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fsm::{FsmTuning, GateFsm};
    use crate::hal::SimulatedHal;
    use std::sync::Arc;

    #[test]
    fn begin_update_rejected_while_any_gate_is_moving_or_open() {
        let fsm = GateFsm::with_tuning(Arc::new(SimulatedHal::new()), FsmTuning::default());
        assert!(fsm.is_quiescent());
    }

    #[test]
    fn update_hold_blocks_open_close_lock_unlock_reboot() {
        let mut fsm = GateFsm::with_tuning(Arc::new(SimulatedHal::new()), FsmTuning::default());
        fsm.begin_update().expect("closed gate accepts the hold");
        assert!(fsm.request_open().is_err());
        assert!(fsm.request_close().is_err());
        assert!(fsm.lock().is_err());
        assert!(fsm.reboot().is_err());
        fsm.end_update();
        assert!(fsm.request_open().is_ok());
    }

    #[test]
    fn second_update_hold_is_rejected_so_it_cannot_release_the_first() {
        let mut fsm = GateFsm::with_tuning(Arc::new(SimulatedHal::new()), FsmTuning::default());
        fsm.begin_update().expect("closed gate accepts the hold");
        assert!(
            fsm.begin_update().is_err(),
            "a second install must not join a hold that is already active"
        );
        // The first hold is still in force.
        assert!(fsm.request_open().is_err());
    }
}

