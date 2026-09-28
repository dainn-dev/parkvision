//! Incident reporting on the `.../incident` topic. Mirrors the backend
//! bridge dedup: at most one *open* incident per `kind` — repeat `report`
//! calls while open are dropped until `clear` re-arms (the orchestrator
//! clears when the FSM leaves Fault).

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use tracing::warn;

use crate::config::EdgeConfig;
use crate::fsm::FsmEvent;
use crate::hal::HalSensors;
use crate::mqtt::Publisher;
use crate::payloads::{incident_topic, IncidentFrame};

pub struct IncidentReporter {
    publisher: Arc<dyn Publisher>,
    open: Mutex<HashSet<&'static str>>,
    cfg: Arc<EdgeConfig>,
}

impl IncidentReporter {
    pub fn new(publisher: Arc<dyn Publisher>, cfg: Arc<EdgeConfig>) -> Self {
        Self {
            publisher,
            open: Mutex::new(HashSet::new()),
            cfg,
        }
    }

    /// Report an FSM incident event. Non-incident events are ignored.
    /// Repeated reports of an already-open `kind` are dropped.
    pub async fn report(&self, ev: &FsmEvent, sensors: &HalSensors) {
        let (kind, severity, message) = match ev {
            FsmEvent::Incident {
                kind,
                severity,
                message,
            } => (*kind, *severity, message),
            _ => return,
        };
        {
            let mut open = self.open.lock().unwrap();
            if !open.insert(kind) {
                return; // already open for this kind
            }
        }
        let frame = IncidentFrame {
            incident_type: kind.to_string(),
            severity: severity.to_string(),
            device_id: Some(self.cfg.device_id),
            title: Some(kind.to_string()),
            message: Some(message.clone()),
            snapshot_urls: vec![],
            arm_angle_deg: Some(sensors.arm_angle_deg),
            relay_current_a: Some(sensors.motor_current_a),
        };
        let topic = incident_topic(&self.cfg.tenant_id, &self.cfg.site_id, &self.cfg.gate_id);
        if let Err(e) = self
            .publisher
            .publish(&topic, serde_json::to_value(&frame).unwrap(), 1)
            .await
        {
            warn!("incident publish failed: {e}");
        }
    }

    /// Re-arm `kind` — called by the orchestrator when the FSM leaves Fault.
    pub async fn clear(&self, kind: &'static str) {
        self.open.lock().unwrap().remove(&kind);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{EdgeConfig, MqttConfig};
    use crate::fsm::FsmEvent;
    use crate::hal::HalSensors;
    use crate::mqtt::MemPublisher;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";
    const DEVICE: &str = "44444444-4444-4444-4444-444444444444";

    fn cfg() -> Arc<EdgeConfig> {
        Arc::new(EdgeConfig {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: None,
            device_id: Uuid::parse_str(DEVICE).unwrap(),
            api_key: "k".to_string(),
            api_base_url: "http://localhost".to_string(),
            mqtt: MqttConfig {
                host: "localhost".to_string(),
                port: 1883,
                username: None,
                password: None,
                tls: false,
            },
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
        })
    }

    fn sensors() -> HalSensors {
        HalSensors {
            arm_angle_deg: 42,
            motor_current_a: 9.4,
            loop_active: false,
            motor_temp_c: 55.0,
            ups_battery_pct: 98,
        }
    }

    fn fault_event() -> FsmEvent {
        FsmEvent::Incident {
            kind: "fault",
            severity: "critical",
            message: "Stuck at 42°".to_string(),
        }
    }

    #[tokio::test]
    async fn repeat_report_of_same_kind_is_deduped() {
        let pub_ = Arc::new(MemPublisher::new());
        let rep = IncidentReporter::new(pub_.clone(), cfg());
        rep.report(&fault_event(), &sensors()).await;
        rep.report(&fault_event(), &sensors()).await;
        assert_eq!(pub_.sent.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn clear_rearms_the_kind() {
        let pub_ = Arc::new(MemPublisher::new());
        let rep = IncidentReporter::new(pub_.clone(), cfg());
        rep.report(&fault_event(), &sensors()).await;
        rep.clear("fault").await;
        rep.report(&fault_event(), &sensors()).await;
        assert_eq!(pub_.sent.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn payload_goes_to_incident_topic_with_context() {
        let pub_ = Arc::new(MemPublisher::new());
        let cfg = cfg();
        let rep = IncidentReporter::new(pub_.clone(), cfg.clone());
        rep.report(&fault_event(), &sensors()).await;

        let sent = pub_.sent.lock().unwrap();
        let (topic, body, qos) = &sent[0];
        assert_eq!(
            topic,
            &crate::payloads::incident_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id)
        );
        assert_eq!(*qos, 1);
        assert_eq!(body["type"], "fault");
        assert_eq!(body["severity"], "critical");
        assert_eq!(body["deviceId"], DEVICE);
        assert_eq!(body["armAngleDeg"], 42);
        assert!((body["relayCurrentA"].as_f64().unwrap() - 9.4).abs() < 0.01);
    }
}
