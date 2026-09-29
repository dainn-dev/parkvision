//! Optional local kiosk lock — a password the operator sets to gate the UI.
//! It is NOT a server credential: the API token persists independently and
//! stays valid until the tenant admin revokes it. The password is stored
//! only as an argon2 hash in `edge-lock.json`; nothing leaves the device.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{Context, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use serde::Serialize;

pub struct LockStore {
    path: PathBuf,
}

impl LockStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn read_hash(&self) -> Result<Option<String>> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(r) => r,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e).context("read lock file"),
        };
        let v: serde_json::Value = serde_json::from_str(&raw).context("parse lock file")?;
        Ok(v.get("passwordHash").and_then(|h| h.as_str()).map(str::to_string))
    }

    pub fn set_password(&self, password: Option<&str>) -> Result<()> {
        match password {
            Some(pw) => {
                let salt = SaltString::generate(&mut OsRng);
                let hash = Argon2::default()
                    .hash_password(pw.as_bytes(), &salt)
                    .map_err(|e| anyhow::anyhow!("hash password: {e}"))?
                    .to_string();
                if let Some(parent) = self.path.parent() {
                    fs::create_dir_all(parent).context("create config dir")?;
                }
                fs::write(
                    &self.path,
                    serde_json::to_string(&serde_json::json!({"passwordHash": hash}))?,
                )
                .context("write lock file")?;
            }
            None => match fs::remove_file(&self.path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e).context("remove lock file"),
            },
        }
        Ok(())
    }

    pub fn verify(&self, password: &str) -> Result<bool> {
        let Some(hash) = self.read_hash()? else {
            return Ok(false);
        };
        let parsed = PasswordHash::new(&hash).map_err(|e| anyhow::anyhow!("stored hash: {e}"))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    }

    pub fn is_enabled(&self) -> bool {
        self.read_hash().map(|h| h.is_some()).unwrap_or(false)
    }
}

/// Managed lock state — `locked` is session-only; on app start a configured
/// password means locked until `unlock` succeeds.
pub struct LockState {
    pub store: LockStore,
    pub locked: bool,
}

pub type SharedLock = Mutex<Option<LockState>>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    pub enabled: bool,
    pub locked: bool,
}

#[tauri::command]
pub fn set_lock_password(
    password: Option<String>,
    state: tauri::State<'_, SharedLock>,
) -> Result<LockStatus, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let st = guard.as_mut().ok_or("lock store unavailable")?;
    if let Some(pw) = &password {
        if pw.len() < 4 {
            return Err("password must be at least 4 characters".to_string());
        }
    }
    st.store
        .set_password(password.as_deref())
        .map_err(|e| e.to_string())?;
    st.locked = password.is_some();
    Ok(LockStatus {
        enabled: password.is_some(),
        locked: st.locked,
    })
}

#[tauri::command]
pub fn unlock(password: String, state: tauri::State<'_, SharedLock>) -> Result<bool, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let st = guard.as_mut().ok_or("lock store unavailable")?;
    let ok = st.store.verify(&password).map_err(|e| e.to_string())?;
    if ok {
        st.locked = false;
    }
    Ok(ok)
}

/// Explicitly re-lock (kiosk idle / operator leaving the desk).
#[tauri::command]
pub fn lock_now(state: tauri::State<'_, SharedLock>) -> Result<LockStatus, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let st = guard.as_mut().ok_or("lock store unavailable")?;
    if st.store.is_enabled() {
        st.locked = true;
    }
    Ok(LockStatus {
        enabled: st.store.is_enabled(),
        locked: st.locked,
    })
}

#[tauri::command]
pub fn lock_status(state: tauri::State<'_, SharedLock>) -> Result<LockStatus, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let st = guard.as_ref().ok_or("lock store unavailable")?;
    Ok(LockStatus {
        enabled: st.store.is_enabled(),
        locked: st.locked,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_verify_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let store = LockStore::new(dir.path().join("edge-lock.json"));
        assert!(!store.is_enabled());
        store.set_password(Some("kiosk-1234")).unwrap();
        assert!(store.is_enabled());
        assert!(store.verify("kiosk-1234").unwrap());
        assert!(!store.verify("wrong").unwrap());
    }

    #[test]
    fn clear_disables() {
        let dir = tempfile::tempdir().unwrap();
        let store = LockStore::new(dir.path().join("edge-lock.json"));
        store.set_password(Some("x")).unwrap();
        store.set_password(None).unwrap();
        assert!(!store.is_enabled());
        assert!(!store.verify("x").unwrap());
    }
}
