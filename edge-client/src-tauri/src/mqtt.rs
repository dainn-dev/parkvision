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

use crate::config::MqttConfig;

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

impl MqttClient {
    /// Connect, subscribe, and spawn the event-loop task.
    /// Returns the client handle and a receiver of raw JSON bodies published
    /// on the subscribed topics.
    pub async fn connect(
        cfg: &MqttConfig,
        client_id: &str,
        sub_topics: &[String],
    ) -> Result<(Arc<Self>, mpsc::Receiver<serde_json::Value>)> {
        let mut opts = MqttOptions::new(client_id, &cfg.host, cfg.port);
        opts.set_keep_alive(Duration::from_secs(10));
        if let (Some(u), Some(p)) = (&cfg.username, &cfg.password) {
            opts.set_credentials(u, p);
        }
        if cfg.tls {
            opts.set_transport(Transport::tls_with_default_config());
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
