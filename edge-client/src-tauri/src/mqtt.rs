//! MQTT client for the EMQX link. `Publisher` is the seam every loop writes
//! through (telemetry/heartbeat/incidents/acks); `MemPublisher` is the test
//! fake. `MqttClient` wraps rumqttc: reconnecting event loop, exponential
//! backoff 1s→30s, inbound command-topic bodies forwarded on a channel.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS, Transport};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::config::{MqttConfig, MqttTransport};

#[async_trait]
pub trait Publisher: Send + Sync {
    async fn publish(&self, topic: &str, payload: serde_json::Value, qos: u8) -> Result<()>;
    fn is_connected(&self) -> bool;
}

/// Test/diagnostic publisher that records frames instead of sending them.
pub struct MemPublisher {
    pub sent: Mutex<Vec<(String, serde_json::Value, u8)>>,
    connected: AtomicBool,
}

impl Default for MemPublisher {
    fn default() -> Self {
        Self::new()
    }
}

impl MemPublisher {
    pub fn new() -> Self {
        Self {
            sent: Mutex::new(Vec::new()),
            connected: AtomicBool::new(true),
        }
    }

    pub fn set_connected(&self, connected: bool) {
        self.connected.store(connected, Ordering::SeqCst);
    }
}

#[async_trait]
impl Publisher for MemPublisher {
    async fn publish(&self, topic: &str, payload: serde_json::Value, qos: u8) -> Result<()> {
        self.sent
            .lock()
            .unwrap()
            .push((topic.to_string(), payload, qos));
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }
}

pub struct MqttClient {
    client: AsyncClient,
    connected: Arc<AtomicBool>,
}

fn qos_of(q: u8) -> QoS {
    match q {
        0 => QoS::AtMostOnce,
        1 => QoS::AtLeastOnce,
        _ => QoS::ExactlyOnce,
    }
}

#[async_trait]
impl Publisher for MqttClient {
    async fn publish(&self, topic: &str, payload: serde_json::Value, qos: u8) -> Result<()> {
        let body = serde_json::to_vec(&payload)?;
        self.client
            .publish(topic, qos_of(qos), false, body)
            .await
            .context("mqtt publish")
    }

    fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }
}

/// WebSocket URL for a broker reached as MQTT over WebSocket. rumqttc takes
/// host and port from this URL, not from `MqttOptions::new`'s arguments.
fn websocket_url(cfg: &MqttConfig) -> String {
    let scheme = if cfg.tls { "wss" } else { "ws" };
    let path = cfg.ws_path.as_deref().unwrap_or("/mqtt");
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    format!("{scheme}://{}:{}{path}", cfg.host, cfg.port)
}

/// Broker address and transport for `cfg`.
fn mqtt_options(cfg: &MqttConfig, client_id: &str) -> MqttOptions {
    match cfg.transport {
        MqttTransport::Tcp => {
            let mut opts = MqttOptions::new(client_id, &cfg.host, cfg.port);
            if cfg.tls {
                opts.set_transport(Transport::tls_with_default_config());
            }
            opts
        }
        MqttTransport::Websocket => {
            let mut opts = MqttOptions::new(client_id, websocket_url(cfg), cfg.port);
            opts.set_transport(if cfg.tls {
                Transport::wss_with_default_config()
            } else {
                Transport::Ws
            });
            opts
        }
    }
}

impl MqttClient {
    /// Connect, subscribe, and spawn the event-loop task.
    /// Returns the client handle and a receiver of raw JSON bodies published
    /// on the subscribed topics.
    pub async fn connect(
        cfg: &MqttConfig,
        client_id: &str,
        sub_topics: &[String],
    ) -> Result<(Arc<Self>, mpsc::Receiver<serde_json::Value>)> {
        let mut opts = mqtt_options(cfg, client_id);
        opts.set_keep_alive(Duration::from_secs(10));
        if let (Some(u), Some(p)) = (&cfg.username, &cfg.password) {
            opts.set_credentials(u, p);
        }

        let (client, mut eventloop) = AsyncClient::new(opts, 64);
        for t in sub_topics {
            client
                .subscribe(t, QoS::AtLeastOnce)
                .await
                .with_context(|| format!("subscribe {t}"))?;
        }

        let (tx, rx) = mpsc::channel::<serde_json::Value>(256);
        let connected = Arc::new(AtomicBool::new(false));
        let conn_flag = connected.clone();
        let topics: Vec<String> = sub_topics.to_vec();
        let sub_client = client.clone();

        tokio::spawn(async move {
            let mut backoff = Duration::from_secs(1);
            loop {
                match eventloop.poll().await {
                    Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                        info!("mqtt connected");
                        conn_flag.store(true, Ordering::SeqCst);
                        backoff = Duration::from_secs(1);
                        // re-subscribe after (re)connect — clean session drops them
                        for t in &topics {
                            let _ = sub_client.subscribe(t, QoS::AtLeastOnce).await;
                        }
                    }
                    Ok(Event::Incoming(Incoming::Publish(p))) => {
                        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&p.payload) {
                            if tx.try_send(v).is_err() {
                                warn!("inbound mqtt channel full — dropping message");
                            }
                        } else {
                            warn!("non-JSON payload on {}", p.topic);
                        }
                    }
                    Ok(_) => {}
                    Err(e) => {
                        if conn_flag.swap(false, Ordering::SeqCst) {
                            warn!("mqtt connection lost: {e}");
                        }
                        tokio::time::sleep(backoff).await;
                        backoff = (backoff * 2).min(Duration::from_secs(30));
                    }
                }
            }
        });

        Ok((Arc::new(Self { client, connected }), rx))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn mem_publisher_records_topic_payload_qos() {
        let pub_ = MemPublisher::new();
        pub_.publish("a/b/c", json!({"x": 1}), 1).await.unwrap();
        pub_.publish("d/e", json!({"y": 2}), 0).await.unwrap();
        let sent = pub_.sent.lock().unwrap();
        assert_eq!(sent.len(), 2);
        assert_eq!(sent[0].0, "a/b/c");
        assert_eq!(sent[0].1, json!({"x": 1}));
        assert_eq!(sent[0].2, 1);
        assert_eq!(sent[1].2, 0);
    }

    #[tokio::test]
    async fn mem_publisher_connected_flag_toggles() {
        let pub_ = MemPublisher::new();
        assert!(pub_.is_connected());
        pub_.set_connected(false);
        assert!(!pub_.is_connected());
        // publishes while disconnected are still recorded (queue semantics
        // live in the outbox, not the publisher)
        pub_.publish("t", json!({}), 1).await.unwrap();
        assert_eq!(pub_.sent.lock().unwrap().len(), 1);
    }

    fn ws_cfg(tls: bool, ws_path: Option<&str>) -> MqttConfig {
        MqttConfig {
            host: "mqtt.example.com".to_string(),
            port: 443,
            username: None,
            password: None,
            transport: MqttTransport::Websocket,
            ws_path: ws_path.map(str::to_string),
            tls,
        }
    }

    #[test]
    fn websocket_url_uses_scheme_port_and_path() {
        assert_eq!(
            websocket_url(&ws_cfg(true, Some("/mqtt"))),
            "wss://mqtt.example.com:443/mqtt"
        );
        assert_eq!(
            websocket_url(&ws_cfg(false, Some("mqtt"))),
            "ws://mqtt.example.com:443/mqtt"
        );
        assert_eq!(
            websocket_url(&ws_cfg(true, None)),
            "wss://mqtt.example.com:443/mqtt"
        );
    }

    #[test]
    fn options_select_transport_from_config() {
        let ws = mqtt_options(&ws_cfg(true, Some("/mqtt")), "edge-1");
        assert!(matches!(ws.transport(), Transport::Wss(_)));
        assert_eq!(ws.broker_address().0, "wss://mqtt.example.com:443/mqtt");

        let tcp_cfg = MqttConfig {
            transport: MqttTransport::Tcp,
            tls: false,
            ..ws_cfg(false, None)
        };
        let tcp = mqtt_options(&tcp_cfg, "edge-1");
        assert!(matches!(tcp.transport(), Transport::Tcp));
        assert_eq!(tcp.broker_address(), ("mqtt.example.com".to_string(), 443));
    }

    /// Needs EMQX with its WebSocket listener on localhost:8083 (/mqtt).
    /// Run with: cargo test mqtt::tests::live_websocket_roundtrip -- --ignored
    #[tokio::test]
    #[ignore]
    async fn live_websocket_roundtrip() {
        let cfg = MqttConfig {
            host: "localhost".to_string(),
            port: std::env::var("PV_TEST_MQTT_WS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8083),
            username: std::env::var("PV_TEST_MQTT_USER").ok(),
            password: std::env::var("PV_TEST_MQTT_PASS").ok(),
            transport: MqttTransport::Websocket,
            ws_path: Some("/mqtt".to_string()),
            tls: false,
        };
        let topic = std::env::var("PV_TEST_MQTT_TOPIC")
            .unwrap_or_else(|_| "tenants/t/sites/s/gates/g/command".to_string());
        let client_id = cfg
            .username
            .clone()
            .unwrap_or_else(|| "edge-ws-test".to_string());
        let (client, mut rx) = MqttClient::connect(&cfg, &client_id, &[topic.clone()])
            .await
            .unwrap();
        client
            .publish(&topic, json!({"commandId": "ws"}), 1)
            .await
            .unwrap();
        let msg = tokio::time::timeout(std::time::Duration::from_secs(10), rx.recv())
            .await
            .expect("no message within 10s")
            .expect("channel closed");
        assert_eq!(msg["commandId"], "ws");
    }

    /// Integration test — needs the repo's docker-compose EMQX on localhost:1883.
    /// Run with: cargo test mqtt::tests::live_broker_roundtrip -- --ignored
    #[tokio::test]
    #[ignore]
    async fn live_broker_roundtrip() {
        let cfg = crate::config::MqttConfig {
            host: "localhost".to_string(),
            port: 1883,
            username: None,
            password: None,
            transport: Default::default(),
            ws_path: None,
            tls: false,
        };
        let topic = "tenants/t/sites/s/gates/g/command";
        let (client, mut rx) = MqttClient::connect(&cfg, "edge-test", &[topic.to_string()])
            .await
            .unwrap();
        client
            .publish(topic, json!({"commandId": "x"}), 1)
            .await
            .unwrap();
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), rx.recv())
            .await
            .expect("no message within 5s")
            .expect("channel closed");
        assert_eq!(msg["commandId"], "x");
    }
}
