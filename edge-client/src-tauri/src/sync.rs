//! Edge REST sync — incremental whitelist + rules snapshot from the backend.
//! Auth: `X-Api-Key` (edge:ingest scope). The whitelist cursor lives in
//! `kv["whitelist_synced_at"]` and advances ONLY after a page's upserts have
//! committed — a crash mid-sync just replays rows (upserts are idempotent).

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::config::EdgeConfig;
use crate::store::{RuleRow, Store, VehicleRow};

const PAGE_LIMIT: u32 = 500;

/// The credential was rejected (401/403) — the tenant revoked it or it
/// expired. Distinct from transient failures: the runtime turns this into
/// a deprovision signal instead of retrying forever.
#[derive(Debug)]
pub struct AuthError(pub u16);

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "edge credential rejected: HTTP {}", self.0)
    }
}

impl std::error::Error for AuthError {}

fn check_status(resp: &reqwest::Response, what: &str) -> Result<()> {
    let status = resp.status();
    if status.is_success() {
        return Ok(());
    }
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AuthError(status.as_u16()).into());
    }
    anyhow::bail!("{what} sync failed: HTTP {status}")
}

#[derive(Debug)]
pub struct SyncReport {
    pub upserted: u32,
    pub synced_at: DateTime<Utc>,
    pub pages: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeVehicleEntry {
    plate_normalized: String,
    tag: String,
    valid_from: Option<DateTime<Utc>>,
    valid_to: Option<DateTime<Utc>>,
    status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeWhitelistOut {
    items: Vec<EdgeVehicleEntry>,
    synced_at: DateTime<Utc>,
    truncated: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeRuleEntry {
    id: Uuid,
    site_id: Option<Uuid>,
    name: String,
    rule_type: String,
    priority: i32,
    #[serde(default)]
    schedule: serde_json::Value,
    #[serde(default)]
    conditions: serde_json::Value,
}

pub struct SyncClient {
    http: reqwest::Client,
    cfg: Arc<EdgeConfig>,
    store: Arc<Store>,
}

impl SyncClient {
    pub fn new(cfg: Arc<EdgeConfig>, store: Arc<Store>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("reqwest client");
        Self { http, cfg, store }
    }

    fn whitelist_url(&self) -> String {
        format!(
            "{}/edge/tenants/{}/whitelist",
            self.cfg.api_base_url.trim_end_matches('/'),
            self.cfg.tenant_id
        )
    }

    fn rules_url(&self) -> String {
        format!(
            "{}/edge/tenants/{}/rules",
            self.cfg.api_base_url.trim_end_matches('/'),
            self.cfg.tenant_id
        )
    }

    /// Page through `GET /edge/tenants/{id}/whitelist` until `truncated` is
    /// false. The response `syncedAt` becomes the next cursor — written to
    /// kv only after that page's rows are in SQLite.
    pub async fn sync_whitelist(&self) -> Result<SyncReport> {
        let mut upserted = 0u32;
        let mut pages = 0u32;
        let mut last_synced;

        loop {
            let mut req = self
                .http
                .get(self.whitelist_url())
                .header("X-Api-Key", &self.cfg.api_key)
                .query(&[("limit", PAGE_LIMIT.to_string())]);
            if let Some(cursor) = self.store.kv_get("whitelist_synced_at")? {
                req = req.query(&[("updatedSince", cursor)]);
            }
            let resp = req.send().await.context("whitelist request")?;
            check_status(&resp, "whitelist")?;
            let page: EdgeWhitelistOut = resp.json().await.context("whitelist body decode")?;

            for item in &page.items {
                self.store.upsert_vehicle(&VehicleRow {
                    plate_normalized: item.plate_normalized.clone(),
                    tag: item.tag.clone(),
                    valid_from: item.valid_from,
                    valid_to: item.valid_to,
                    status: item.status.clone(),
                    updated_at: item.updated_at,
                })?;
            }
            upserted += page.items.len() as u32;
            pages += 1;
            last_synced = page.synced_at;
            // cursor committed only after rows are durable
            self.store
                .kv_set("whitelist_synced_at", &page.synced_at.to_rfc3339())?;

            if !page.truncated {
                break;
            }
        }
        Ok(SyncReport {
            upserted,
            synced_at: last_synced,
            pages,
        })
    }

    /// Full rules snapshot — backend returns all active rules for the tenant.
    pub async fn sync_rules(&self) -> Result<u32> {
        let resp = self
            .http
            .get(self.rules_url())
            .header("X-Api-Key", &self.cfg.api_key)
            .send()
            .await
            .context("rules request")?;
        check_status(&resp, "rules")?;
        let entries: Vec<EdgeRuleEntry> = resp.json().await.context("rules body decode")?;
        let rows: Vec<RuleRow> = entries
            .into_iter()
            .map(|e| RuleRow {
                id: e.id,
                site_id: e.site_id,
                name: e.name,
                rule_type: e.rule_type,
                priority: e.priority,
                schedule: e.schedule,
                conditions: e.conditions,
            })
            .collect();
        let n = rows.len() as u32;
        self.store.replace_rules(&rows)?;
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{EdgeConfig, GateBinding, MqttConfig};
    use crate::store::Store;
    use httpmock::prelude::*;
    use serde_json::json;
    use std::sync::Arc;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";

    fn cfg(base: &str) -> Arc<EdgeConfig> {
        Arc::new(EdgeConfig {
            version: 2,
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap(),
            device_id: Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            api_key: "edge-key-123".to_string(),
            api_base_url: base.to_string(),
            mqtt: MqttConfig {
                host: "localhost".to_string(),
                port: 1883,
                username: None,
                password: None,
                tls: false,
            },
            gates: vec![GateBinding {
                gate_id: Uuid::parse_str(GATE).unwrap(),
                lane_id: None,
                direction: "entry".to_string(),
                cameras: vec![],
                barrier: None,
            }],
        })
    }

    fn temp_store() -> (Arc<Store>, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (
            Arc::new(Store::open(&dir.path().join("edge.db")).unwrap()),
            dir,
        )
    }

    fn vehicle_json(plate: &str) -> serde_json::Value {
        json!({
            "plateNormalized": plate,
            "tag": "resident",
            "validFrom": "2026-01-01T00:00:00Z",
            "validTo": null,
            "status": "active",
            "updatedAt": "2026-09-28T08:00:00Z"
        })
    }

    #[tokio::test]
    async fn single_page_sync_upserts_and_stores_cursor() {
        let server = MockServer::start_async().await;
        let mock = server
            .mock_async(|when, then| {
                when.method(GET)
                    .path(format!("/edge/tenants/{TENANT}/whitelist"))
                    .header("x-api-key", "edge-key-123");
                then.status(200).json_body(json!({
                    "items": [vehicle_json("30E89241")],
                    "syncedAt": "2026-09-28T08:30:00Z",
                    "truncated": false
                }));
            })
            .await;

        let (store, _d) = temp_store();
        let client = SyncClient::new(cfg(&server.base_url()), store.clone());
        let report = client.sync_whitelist().await.unwrap();

        assert_eq!(report.upserted, 1);
        assert_eq!(report.pages, 1);
        assert!(store.vehicle("30E89241").unwrap().is_some());
        assert_eq!(
            store.kv_get("whitelist_synced_at").unwrap().unwrap(),
            "2026-09-28T08:30:00+00:00"
        );
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn multi_page_sync_uses_cursor_until_not_truncated() {
        let server = MockServer::start_async().await;
        let path = format!("/edge/tenants/{TENANT}/whitelist");
        server
            .mock_async(|when, then| {
                when.method(GET)
                    .path(&path)
                    .query_param("updatedSince", "2026-09-01T00:00:00+00:00");
                then.status(200).json_body(json!({
                    "items": [vehicle_json("AAA111")],
                    "syncedAt": "2026-09-15T00:00:00Z",
                    "truncated": true
                }));
            })
            .await;
        server
            .mock_async(|when, then| {
                when.method(GET)
                    .path(&path)
                    .query_param("updatedSince", "2026-09-15T00:00:00+00:00");
                then.status(200).json_body(json!({
                    "items": [vehicle_json("BBB222")],
                    "syncedAt": "2026-09-28T08:30:00Z",
                    "truncated": false
                }));
            })
            .await;

        let (store, _d) = temp_store();
        store
            .kv_set("whitelist_synced_at", "2026-09-01T00:00:00+00:00")
            .unwrap();
        let client = SyncClient::new(cfg(&server.base_url()), store.clone());
        let report = client.sync_whitelist().await.unwrap();

        assert_eq!(report.pages, 2);
        assert_eq!(report.upserted, 2);
        assert!(store.vehicle("AAA111").unwrap().is_some());
        assert!(store.vehicle("BBB222").unwrap().is_some());
        assert_eq!(
            store.kv_get("whitelist_synced_at").unwrap().unwrap(),
            "2026-09-28T08:30:00+00:00"
        );
    }

    #[tokio::test]
    async fn unauthorized_leaves_cursor_unchanged() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.method(GET).path_contains("/whitelist");
                then.status(401)
                    .json_body(json!({"detail": "Invalid or expired API key"}));
            })
            .await;
        let (store, _d) = temp_store();
        store
            .kv_set("whitelist_synced_at", "2026-09-01T00:00:00+00:00")
            .unwrap();
        let client = SyncClient::new(cfg(&server.base_url()), store.clone());
        assert!(client.sync_whitelist().await.is_err());
        assert_eq!(
            store.kv_get("whitelist_synced_at").unwrap().unwrap(),
            "2026-09-01T00:00:00+00:00"
        );
    }

    #[tokio::test]
    async fn rules_sync_replaces_local_rules() {
        let server = MockServer::start_async().await;
        let rule_id = Uuid::new_v4();
        server
            .mock_async(|when, then| {
                when.method(GET)
                    .path(format!("/edge/tenants/{TENANT}/rules"))
                    .header("x-api-key", "edge-key-123");
                then.status(200).json_body(json!([{
                    "id": rule_id,
                    "siteId": null,
                    "name": "Residents always",
                    "ruleType": "allow",
                    "priority": 10,
                    "schedule": {"days": ["mon","tue"]},
                    "conditions": {"tags": ["resident"]}
                }]));
            })
            .await;
        let (store, _d) = temp_store();
        let client = SyncClient::new(cfg(&server.base_url()), store.clone());
        let n = client.sync_rules().await.unwrap();
        assert_eq!(n, 1);
        let rules = store.rules().unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].name, "Residents always");
        assert_eq!(rules[0].rule_type, "allow");
        assert_eq!(rules[0].priority, 10);
    }
}
