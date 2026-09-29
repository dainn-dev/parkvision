//! Remote command execution: backend → `.../command` topic → here → FSM →
//! `command_ack` on the telemetry topic (spec §5.1.3). Every commandId is
//! recorded in `CommandLog` *before* the ack is published, so a broker
//! redelivery replays the stored ack instead of re-firing a relay. The
//! in-memory `InMemCommandLog` is for tests/diagnostics; the SQLite impl
//! lands in Task 10.

use std::sync::{Arc, Mutex};

use tracing::{info, warn};
use uuid::Uuid;

use crate::config::GateCtx;
use crate::fsm::GateFsm;
use crate::mqtt::Publisher;
use crate::payloads::{telemetry_topic, CommandAck, CommandPayload};

/// Deduplication record for inbound commands. `seen` returns the stored
/// success flag if this commandId was already processed.
pub trait CommandLog: Send + Sync {
    fn seen(&self, id: Uuid) -> Option<bool>;
    fn record(&self, id: Uuid, success: bool);
}

/// Volatile dedup log — used by tests; production swaps in SQLite (Task 10).
pub struct InMemCommandLog {
    map: Mutex<std::collections::HashMap<Uuid, bool>>,
}

impl Default for InMemCommandLog {
    fn default() -> Self {
        Self::new()
    }
}

impl InMemCommandLog {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(std::collections::HashMap::new()),
        }
    }
}

impl CommandLog for InMemCommandLog {
    fn seen(&self, id: Uuid) -> Option<bool> {
        self.map.lock().unwrap().get(&id).copied()
    }
    fn record(&self, id: Uuid, success: bool) {
        self.map.lock().unwrap().insert(id, success);
    }
}

pub struct CommandExecutor {
    fsm: Arc<Mutex<GateFsm>>,
    publisher: Arc<dyn Publisher>,
    log: Arc<dyn CommandLog>,
    cfg: Arc<GateCtx>,
}

impl CommandExecutor {
    pub fn new(
        fsm: Arc<Mutex<GateFsm>>,
        publisher: Arc<dyn Publisher>,
        log: Arc<dyn CommandLog>,
        cfg: Arc<GateCtx>,
    ) -> Self {
        Self {
            fsm,
            publisher,
            log,
            cfg,
        }
    }

    /// Entry point from the MQTT inbound channel.
    pub async fn handle(&self, body: serde_json::Value) {
        let cmd: CommandPayload = match serde_json::from_value(body) {
            Ok(c) => c,
            Err(e) => {
                warn!("unparseable command body: {e}");
                return;
            }
        };

        // Not addressed to this gate — someone else's traffic on a shared
        // subscription. No ack: the owning edge device will answer.
        if cmd.gate_id != self.cfg.gate_id || cmd.tenant_id != self.cfg.tenant_id {
            return;
        }

        let topic = telemetry_topic(&self.cfg.tenant_id, &self.cfg.site_id, &self.cfg.gate_id);

        // Broker redelivery: replay the stored verdict.
        if let Some(prev) = self.log.seen(cmd.command_id) {
            info!(
                "command {} already processed — replaying ack",
                cmd.command_id
            );
            let ack = if prev {
                CommandAck::ok(cmd.command_id)
            } else {
                CommandAck::err(cmd.command_id, "replay")
            };
            let _ = self
                .publisher
                .publish(&topic, serde_json::to_value(&ack).unwrap(), 1)
                .await;
            return;
        }

        let result: Result<(), String> = {
            let mut fsm = self.fsm.lock().unwrap();
            match cmd.command.as_str() {
                "open" => fsm.request_open().map_err(|r| r.as_str().to_string()),
                "close" => fsm.request_close().map_err(|r| r.as_str().to_string()),
                "lock" => {
                    fsm.lock();
                    Ok(())
                }
                "unlock" => fsm.unlock().map_err(|r| r.as_str().to_string()),
                "reboot" => fsm.reboot().map_err(|r| r.as_str().to_string()),
                // MQTT subscription is live (we just received this), so relink
                // is a re-handshake: ack success; the orchestrator may kick a
                // heartbeat. No FSM transition.
                "relink" => Ok(()),
                _ => Err("unsupported_command".to_string()),
            }
        };

        let success = result.is_ok();
        // Record the verdict BEFORE publishing so a crash+redelivery still
        // dedups; SQLite impl makes this durable across restarts (Task 10).
        self.log.record(cmd.command_id, success);

        let ack = match result {
            Ok(()) => CommandAck::ok(cmd.command_id),
            Err(e) => CommandAck::err(cmd.command_id, e),
        };
        if let Err(e) = self
            .publisher
            .publish(&topic, serde_json::to_value(&ack).unwrap(), 1)
            .await
        {
            warn!("command ack publish failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::GateCtx;
    use crate::fsm::GateFsm;
    use crate::hal::{BarrierHal, HalSensors, SimulatedHal};
    use crate::mqtt::MemPublisher;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";
    const DEVICE: &str = "44444444-4444-4444-4444-444444444444";

    fn cfg() -> Arc<GateCtx> {
        Arc::new(GateCtx {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            device_id: Uuid::parse_str(DEVICE).unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: None,
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
            cameras: vec![],
        })
    }

    fn cmd_body(command: &str) -> serde_json::Value {
        cmd_body_with(command, Uuid::new_v4(), Uuid::parse_str(GATE).unwrap())
    }

    fn cmd_body_with(command: &str, id: Uuid, gate: Uuid) -> serde_json::Value {
        json!({
            "commandId": id,
            "correlationId": "test",
            "command": command,
            "gateId": gate,
            "tenantId": TENANT,
            "issuedAt": "2026-09-28T08:30:10+00:00",
            "payload": {}
        })
    }

    /// HAL spy counting energize_open calls so dedup is observable.
    struct SpyHal {
        inner: SimulatedHal,
        opens: AtomicUsize,
    }

    impl SpyHal {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                inner: SimulatedHal::new(),
                opens: AtomicUsize::new(0),
            })
        }
    }

    impl BarrierHal for SpyHal {
        fn energize_open(&self) -> anyhow::Result<()> {
            self.opens.fetch_add(1, Ordering::SeqCst);
            self.inner.energize_open()
        }
        fn energize_close(&self) -> anyhow::Result<()> {
            self.inner.energize_close()
        }
        fn cut_motor(&self) -> anyhow::Result<()> {
            self.inner.cut_motor()
        }
        fn relay_power_cycle(&self) -> anyhow::Result<()> {
            self.inner.relay_power_cycle()
        }
        fn sensors(&self) -> HalSensors {
            self.inner.sensors()
        }
        fn home_calibrate(&self) -> anyhow::Result<()> {
            self.inner.home_calibrate()
        }
    }

    struct Rig {
        exec: CommandExecutor,
        pub_: Arc<MemPublisher>,
        hal: Arc<SpyHal>,
        log: Arc<InMemCommandLog>,
        cfg: Arc<GateCtx>,
    }

    fn rig() -> Rig {
        let hal = SpyHal::new();
        let pub_ = Arc::new(MemPublisher::new());
        let log = Arc::new(InMemCommandLog::new());
        let cfg = cfg();
        let exec = CommandExecutor::new(
            Arc::new(Mutex::new(GateFsm::new(hal.clone()))),
            pub_.clone(),
            log.clone(),
            cfg.clone(),
        );
        Rig {
            exec,
            pub_,
            hal,
            log,
            cfg,
        }
    }

    fn telemetry_topic(rig: &Rig) -> String {
        crate::payloads::telemetry_topic(&rig.cfg.tenant_id, &rig.cfg.site_id, &rig.cfg.gate_id)
    }

    #[tokio::test]
    async fn open_command_publishes_success_ack_on_telemetry_topic() {
        let rig = rig();
        rig.exec.handle(cmd_body("open")).await;
        let sent = rig.pub_.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, telemetry_topic(&rig));
        assert_eq!(sent[0].2, 1, "ack must be QoS 1");
        assert_eq!(sent[0].1["type"], "command_ack");
        assert_eq!(sent[0].1["success"], true);
    }

    #[tokio::test]
    async fn duplicate_command_id_replays_stored_ack_without_reexecuting() {
        let rig = rig();
        let id = Uuid::new_v4();
        let body = cmd_body_with("open", id, rig.cfg.gate_id);
        rig.exec.handle(body.clone()).await;
        rig.exec.handle(body).await;
        assert_eq!(
            rig.hal.opens.load(Ordering::SeqCst),
            1,
            "open must run once"
        );
        let sent = rig.pub_.sent.lock().unwrap();
        assert_eq!(sent.len(), 2, "ack republished for the duplicate");
        assert!(sent
            .iter()
            .all(|(_, p, _)| p["commandId"] == id.to_string()));
        assert!(sent.iter().all(|(_, p, _)| p["success"] == true));
    }

    #[tokio::test]
    async fn open_while_locked_acks_failure_locked() {
        let rig = rig();
        rig.exec.handle(cmd_body("lock")).await;
        rig.exec.handle(cmd_body("open")).await;
        let sent = rig.pub_.sent.lock().unwrap();
        assert_eq!(sent.len(), 2);
        assert_eq!(sent[1].1["success"], false);
        assert_eq!(sent[1].1["error"], "locked");
    }

    #[tokio::test]
    async fn unknown_command_acks_unsupported() {
        let rig = rig();
        rig.exec.handle(cmd_body("explode")).await;
        let sent = rig.pub_.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].1["success"], false);
        assert_eq!(sent[0].1["error"], "unsupported_command");
    }

    #[tokio::test]
    async fn wrong_gate_id_is_dropped_silently() {
        let rig = rig();
        let body = cmd_body_with("open", Uuid::new_v4(), Uuid::new_v4());
        rig.exec.handle(body).await;
        assert_eq!(rig.pub_.sent.lock().unwrap().len(), 0);
        assert!(rig.log.seen(Uuid::new_v4()).is_none());
    }

    #[tokio::test]
    async fn malformed_body_is_dropped_without_panic() {
        let rig = rig();
        rig.exec.handle(json!({"garbage": true})).await;
        rig.exec.handle(json!("not even an object")).await;
        assert_eq!(rig.pub_.sent.lock().unwrap().len(), 0);
    }
}
