//! MQTT wire payloads — the exact shapes `backend/app/realtime/mqtt_bridge.py`
//! parses. camelCase keys, lowercase enum values (spec §8.2). Everything the
//! bridge reads is covered: telemetry column keys, `type:"command_ack"`,
//! `type:"heartbeat"`, ANPR piggy-back fields, incident fields.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::fsm::GateState;

pub fn telemetry_topic(tenant: &Uuid, site: &Uuid, gate: &Uuid) -> String {
    format!("tenants/{tenant}/sites/{site}/gates/{gate}/telemetry")
}

pub fn incident_topic(tenant: &Uuid, site: &Uuid, gate: &Uuid) -> String {
    format!("tenants/{tenant}/sites/{site}/gates/{gate}/incident")
}

pub fn command_topic(tenant: &Uuid, site: &Uuid, gate: &Uuid) -> String {
    format!("tenants/{tenant}/sites/{site}/gates/{gate}/command")
}

/// Periodic gate status frame — keys map to `barrier_gates` columns in the
/// bridge (mqtt_bridge.py:88-99).
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryFrame {
    pub gate_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<GateState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arm_angle_deg: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motor_temp_c: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_detector_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ups_battery: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_cycles: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifetime_cycles: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_plate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_action_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning_note: Option<String>,
    pub timestamp: Option<chrono::DateTime<chrono::Utc>>,
    /// ANPR event fields piggy-backed on the same frame.
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub anpr: Option<AnprFields>,
}

/// ANPR fields — when `plateNumber` is present the bridge records an
/// `access_event` through `decide_access` (mqtt_bridge.py:131-145).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnprFields {
    pub plate_number: String,
    pub direction: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plate_image_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overview_image_key: Option<String>,
}

/// 5s device liveness on the telemetry topic.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatFrame {
    #[serde(rename = "type")]
    pub kind: HeartbeatType,
    pub device_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_usage_pct: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_usage_pct: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage_usage_pct: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u32>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HeartbeatType {
    Heartbeat,
}

impl HeartbeatFrame {
    pub fn new(device_id: Uuid) -> Self {
        Self {
            kind: HeartbeatType::Heartbeat,
            device_id,
            cpu_usage_pct: None,
            ram_usage_pct: None,
            storage_usage_pct: None,
            latency_ms: None,
        }
    }
}

/// Command result — published back on the telemetry topic (spec §5.1.3).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandAck {
    #[serde(rename = "type")]
    pub kind: CommandAckType,
    pub command_id: Uuid,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAckType {
    CommandAck,
}

impl CommandAck {
    pub fn ok(command_id: Uuid) -> Self {
        Self {
            kind: CommandAckType::CommandAck,
            command_id,
            success: true,
            error: None,
        }
    }

    pub fn err(command_id: Uuid, error: impl Into<String>) -> Self {
        Self {
            kind: CommandAckType::CommandAck,
            command_id,
            success: false,
            error: Some(error.into()),
        }
    }
}

/// Inbound command — shape produced by backend `issue_command` outbox.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPayload {
    pub command_id: Uuid,
    pub correlation_id: String,
    pub command: String,
    pub gate_id: Uuid,
    pub tenant_id: Uuid,
    pub issued_at: chrono::DateTime<chrono::Utc>,
    #[serde(default)]
    pub payload: serde_json::Value,
}

/// Incident frame on the incident topic — `type` is the incident type
/// (backend default "fault"; kinds: obstacle|forced_entry|fault|offline|
/// unauthorized_access).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentFrame {
    #[serde(rename = "type")]
    pub incident_type: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub snapshot_urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arm_angle_deg: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_current_a: Option<f32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn ids() -> (Uuid, Uuid, Uuid) {
        (
            Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap(),
            Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap(),
            Uuid::parse_str("33333333-3333-3333-3333-333333333333").unwrap(),
        )
    }

    #[test]
    fn topics_match_bridge_contract() {
        let (t, s, g) = ids();
        assert_eq!(
            telemetry_topic(&t, &s, &g),
            "tenants/11111111-1111-1111-1111-111111111111/sites/22222222-2222-2222-2222-222222222222/gates/33333333-3333-3333-3333-333333333333/telemetry"
        );
        assert_eq!(
            incident_topic(&t, &s, &g),
            "tenants/11111111-1111-1111-1111-111111111111/sites/22222222-2222-2222-2222-222222222222/gates/33333333-3333-3333-3333-333333333333/incident"
        );
        assert_eq!(
            command_topic(&t, &s, &g),
            "tenants/11111111-1111-1111-1111-111111111111/sites/22222222-2222-2222-2222-222222222222/gates/33333333-3333-3333-3333-333333333333/command"
        );
    }

    #[test]
    fn heartbeat_serializes_type_and_camel_keys() {
        let (_, _, g) = ids();
        let frame = HeartbeatFrame {
            cpu_usage_pct: Some(12.5),
            ram_usage_pct: Some(43.0),
            storage_usage_pct: Some(61.0),
            ..HeartbeatFrame::new(g)
        };
        let v = serde_json::to_value(&frame).unwrap();
        assert_eq!(v["type"], "heartbeat");
        assert_eq!(v["deviceId"], "33333333-3333-3333-3333-333333333333");
        assert_eq!(v["cpuUsagePct"], 12.5);
        assert!(v.get("latency_ms").is_none());
    }

    #[test]
    fn command_ack_serializes_exact_shape() {
        let ack = CommandAck::err(
            Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            "locked",
        );
        let v = serde_json::to_value(&ack).unwrap();
        assert_eq!(v["type"], "command_ack");
        assert_eq!(v["commandId"], "44444444-4444-4444-4444-444444444444");
        assert_eq!(v["success"], false);
        assert_eq!(v["error"], "locked");
    }

    #[test]
    fn command_payload_deserializes_backend_outbox() {
        // exact shape produced by backend/app/services/command_service.py
        let body = serde_json::json!({
            "commandId": "44444444-4444-4444-4444-444444444444",
            "correlationId": "abc123",
            "command": "open",
            "gateId": "33333333-3333-3333-3333-333333333333",
            "tenantId": "11111111-1111-1111-1111-111111111111",
            "issuedAt": "2026-09-28T08:30:10+00:00",
            "payload": {}
        });
        let cmd: CommandPayload = serde_json::from_value(body).unwrap();
        assert_eq!(cmd.command, "open");
        assert_eq!(cmd.correlation_id, "abc123");
        assert_eq!(
            cmd.gate_id.to_string(),
            "33333333-3333-3333-3333-333333333333"
        );
    }

    #[test]
    fn gate_state_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&crate::fsm::GateState::Opening).unwrap(),
            "\"opening\""
        );
        assert_eq!(
            serde_json::to_string(&crate::fsm::GateState::Fault).unwrap(),
            "\"fault\""
        );
        assert_eq!(
            serde_json::to_string(&crate::fsm::GateState::Locked).unwrap(),
            "\"locked\""
        );
    }

    #[test]
    fn anpr_fields_flatten_onto_telemetry() {
        let (_, _, g) = ids();
        let frame = TelemetryFrame {
            gate_id: g,
            state: Some(crate::fsm::GateState::Open),
            anpr: Some(AnprFields {
                plate_number: "30E-892.41".to_string(),
                direction: "entry".to_string(),
                confidence: Some(0.985),
                lane_id: Some(Uuid::parse_str("55555555-5555-5555-5555-555555555555").unwrap()),
                plate_image_key: None,
                overview_image_key: None,
            }),
            ..Default::default()
        };
        let v = serde_json::to_value(&frame).unwrap();
        assert_eq!(v["state"], "open");
        assert_eq!(v["plateNumber"], "30E-892.41");
        assert_eq!(v["direction"], "entry");
        assert!((v["confidence"].as_f64().unwrap() - 0.985).abs() < 0.001);
        assert_eq!(v["laneId"], "55555555-5555-5555-5555-555555555555");
        assert!(
            v.get("anpr").is_none(),
            "anpr must be flattened, not nested"
        );
    }

    #[test]
    fn incident_frame_has_bridge_keys() {
        let (_, _, g) = ids();
        let frame = IncidentFrame {
            incident_type: "fault".to_string(),
            severity: "critical".to_string(),
            device_id: Some(g),
            title: Some("Stuck".to_string()),
            message: Some("jam at 42°".to_string()),
            snapshot_urls: vec![],
            arm_angle_deg: Some(42),
            relay_current_a: Some(9.4),
        };
        let v = serde_json::to_value(&frame).unwrap();
        assert_eq!(v["type"], "fault");
        assert_eq!(v["severity"], "critical");
        assert_eq!(v["deviceId"], "33333333-3333-3333-3333-333333333333");
        assert_eq!(v["armAngleDeg"], 42);
        assert!((v["relayCurrentA"].as_f64().unwrap() - 9.4).abs() < 0.01);
    }
}
