//! Walk-in (vãng lai) fee collection: admit an unregistered vehicle at an
//! entry gate, quote its fee at the exit gate from the synced tariff, and
//! settle it (cash / bank QR / waived).
//!
//! Everything here is synchronous-short or runs on the pipeline / command
//! task — nothing touches the 50 ms FSM tick. Each step reports one frame
//! (`walk_in_entry` / `walk_in_exit`) on the gate's telemetry topic, or
//! queues it in the durable outbox (`kind = "walkin"`) while offline.
//!
//! Settling is guarded three ways so a double click, or an automatic bank
//! confirmation racing a manual one, opens the barrier once and reports one
//! settlement: the gate's `pending_fee` lock is held across the whole
//! check → FSM open → close sequence, the FSM is asked to open *before* the
//! session is closed, and `Store::close_walk_in` is a single
//! `UPDATE ... WHERE status='open'`.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::access::normalize_plate;
use crate::mqtt::Publisher;
use crate::payloads::telemetry_topic;
use crate::pipeline::PipelineHooks;
use crate::runtime::{GateRuntime, SharedRuntime};
use crate::store::{BankAccount, Settlement, Store, StoredPricing, WalkInRow};

/// Short payment code printed on tickets and put in the bank transfer text:
/// `PV` + first 8 hex characters of the session id, upper-case.
pub fn pay_code(session_id: &Uuid) -> String {
    format!(
        "PV{}",
        session_id.simple().to_string()[..8].to_ascii_uppercase()
    )
}

/// What the exit lane shows while a walk-in fee is pending.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeQuote {
    pub session_id: Uuid,
    pub plate: String,
    pub entered_at: DateTime<Utc>,
    pub exited_at: DateTime<Utc>,
    pub duration_minutes: i64,
    /// `None` when there is no tariff or no hourly rate — the UI must not
    /// present that as a price of 0.
    pub amount_vnd: Option<i64>,
    pub entry_gate_id: Option<Uuid>,
    pub entry_image_key: Option<String>,
    pub pay_code: String,
    /// Set when an automatic bank notification arrived for less than the fee.
    pub bank_received_vnd: Option<i64>,
}

/// Bank account + timezone for building the payment QR in the UI.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePaymentInfo {
    pub bank_account: Option<BankAccount>,
    pub timezone: String,
}

pub fn site_payment_info(store: &Store) -> Option<SitePaymentInfo> {
    store
        .site_pricing()
        .ok()
        .flatten()
        .map(|p| SitePaymentInfo {
            bank_account: p.bank_account,
            timezone: p.timezone,
        })
}

/// Start of the current local day, as UTC — "today's totals" boundary.
pub fn local_midnight_utc() -> DateTime<Utc> {
    use chrono::{Local, TimeZone};
    let midnight = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
    Local
        .from_local_datetime(&midnight)
        .earliest()
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|| Utc::now() - chrono::Duration::hours(24))
}

fn rfc3339(dt: &DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Publish a walk-in frame on the gate's telemetry topic, or queue it in the
/// durable outbox when the broker is down (or the publish fails).
async fn emit_frame(gate: &GateRuntime, store: &Store, publisher: &dyn Publisher, body: Value) {
    let ctx = &gate.ctx;
    if publisher.is_connected() {
        let topic = telemetry_topic(&ctx.tenant_id, &ctx.site_id, &ctx.gate_id);
        match publisher.publish(&topic, body.clone(), 1).await {
            Ok(()) => return,
            Err(e) => warn!("walk-in frame publish failed, queueing: {e}"),
        }
    }
    if let Err(e) = store.enqueue_event("walkin", body) {
        warn!("walk-in outbox enqueue failed: {e}");
    }
}

/// Admit a walk-in at an entry gate: ask the FSM to open, create the
/// session, report the entry. A refused open (locked/fault) creates nothing.
/// If the plate already has an open session it is reused and its first entry
/// time stands.
pub async fn admit(
    gate: &GateRuntime,
    store: &Store,
    publisher: &dyn Publisher,
    plate: &str,
    image_key: Option<String>,
) -> Result<Uuid, String> {
    if gate.ctx.lane_direction != "entry" {
        return Err("not an entry gate".into());
    }
    let normalized = normalize_plate(plate);
    if normalized.is_empty() {
        return Err("plate required".into());
    }

    let existing = store
        .open_walk_in(&normalized)
        .map_err(|e| format!("store: {e}"))?;

    gate.fsm
        .lock()
        .unwrap()
        .request_open()
        .map_err(|r| r.as_str().to_string())?;

    if let Some(row) = existing {
        return Ok(row.session_id);
    }

    let row = WalkInRow {
        session_id: Uuid::new_v4(),
        plate_normalized: normalized.clone(),
        plate_number: normalized.clone(),
        entry_gate_id: Some(gate.ctx.gate_id),
        entered_at: Utc::now(),
        entry_image_key: image_key.clone(),
        status: "open".into(),
        exit_gate_id: None,
        exited_at: None,
        amount_vnd: None,
        method: None,
        confirmed_by: None,
        waive_reason: None,
        bank_ref: None,
    };
    store
        .insert_walk_in(&row)
        .map_err(|e| format!("store: {e}"))?;

    let frame = json!({
        "type": "walk_in_entry",
        "gateId": gate.ctx.gate_id,
        "sessionId": row.session_id,
        "plateNumber": normalized,
        "enteredAt": rfc3339(&row.entered_at),
        "plateImageKey": image_key,
        "deviceId": gate.ctx.device_id,
    });
    emit_frame(gate, store, publisher, frame).await;
    Ok(row.session_id)
}

/// Fee for `row` if it leaves at `now`, from the synced tariff.
pub fn quote(pricing: Option<&StoredPricing>, row: &WalkInRow, now: DateTime<Utc>) -> FeeQuote {
    let amount_vnd =
        pricing.and_then(|p| crate::pricing::estimate_fee(&p.pricing, row.entered_at, now, &p.timezone));
    FeeQuote {
        session_id: row.session_id,
        plate: row.plate_number.clone(),
        entered_at: row.entered_at,
        exited_at: now,
        duration_minutes: (now - row.entered_at).num_minutes().max(0),
        amount_vnd,
        entry_gate_id: row.entry_gate_id,
        entry_image_key: row.entry_image_key.clone(),
        pay_code: pay_code(&row.session_id),
        bank_received_vnd: None,
    }
}

/// Settle the gate's pending walk-in fee. See the module docs for the
/// double-settle guarantees.
pub async fn settle(
    gate: &GateRuntime,
    store: &Store,
    publisher: &dyn Publisher,
    hooks: &PipelineHooks,
    session_id: Uuid,
    s: Settlement,
) -> Result<(), String> {
    let (fee, amount) = {
        let mut pending = gate.pending_fee.lock().unwrap();
        let fee = match pending.as_ref() {
            Some(f) if f.session_id == session_id => f.clone(),
            _ => {
                let closed = store
                    .walk_in(session_id)
                    .ok()
                    .flatten()
                    .map(|w| w.status != "open")
                    .unwrap_or(false);
                return Err(if closed { "already settled" } else { "no fee pending" }.into());
            }
        };

        let waived = match s.method.as_str() {
            "waived" => true,
            "cash" | "bank_qr" => false,
            _ => return Err("invalid method".into()),
        };
        let amount = if waived {
            if s.waive_reason.as_deref().map(str::trim).unwrap_or("").is_empty() {
                return Err("reason required".into());
            }
            0
        } else {
            fee.amount_vnd.ok_or_else(|| "amount unknown".to_string())?
        };

        // Already closed elsewhere (stale quote)? Don't open the barrier again.
        if store
            .walk_in(session_id)
            .map_err(|e| format!("store: {e}"))?
            .map(|w| w.status != "open")
            .unwrap_or(false)
        {
            *pending = None;
            return Err("already settled".into());
        }

        // FSM first: if it refuses, nothing has changed.
        gate.fsm
            .lock()
            .unwrap()
            .request_open()
            .map_err(|r| r.as_str().to_string())?;

        let closed = store
            .close_walk_in(session_id, gate.ctx.gate_id, fee.exited_at, amount, &s)
            .map_err(|e| format!("store: {e}"))?;
        *pending = None;
        if !closed {
            return Err("already settled".into());
        }
        (fee, amount)
    };

    let plate = normalize_plate(&fee.plate);
    let reason = if s.method == "waived" {
        "walk_in_waived"
    } else {
        "walk_in_paid"
    };
    let _ = store.record_local_event(&plate, &gate.ctx.lane_direction, "allow");
    hooks.notify(json!({
        "plate": plate,
        "gateId": gate.ctx.gate_id,
        "direction": gate.ctx.lane_direction,
        "decision": "allow",
        "reason": reason,
        "amountVnd": amount,
        "method": s.method,
        "at": Utc::now().to_rfc3339(),
    }));

    let frame = json!({
        "type": "walk_in_exit",
        "gateId": gate.ctx.gate_id,
        "sessionId": session_id,
        "plateNumber": plate,
        "enteredAt": rfc3339(&fee.entered_at),
        "exitedAt": rfc3339(&fee.exited_at),
        "amountVnd": amount,
        "method": s.method,
        "confirmedBy": s.confirmed_by,
        "waiveReason": s.waive_reason,
        "bankRef": s.bank_ref,
        "deviceId": gate.ctx.device_id,
    });
    emit_frame(gate, store, publisher, frame).await;
    Ok(())
}

/// Automatic confirmation: the backend saw a bank transfer for `session_id`.
pub async fn on_bank_paid(
    rt: &SharedRuntime,
    session_id: Uuid,
    amount_vnd: i64,
    bank_ref: String,
) {
    on_bank_paid_for(
        &rt.gates,
        &rt.store,
        rt.publisher.as_ref(),
        session_id,
        amount_vnd,
        bank_ref,
    )
    .await
}

/// Same as [`on_bank_paid`], over the pieces the runtime's command dispatcher
/// owns (it is spawned before `SharedRuntime` exists).
pub async fn on_bank_paid_for(
    gates: &[Arc<GateRuntime>],
    store: &Store,
    publisher: &dyn Publisher,
    session_id: Uuid,
    amount_vnd: i64,
    bank_ref: String,
) {
    let found = gates.iter().find_map(|g| {
        g.pending_fee
            .lock()
            .unwrap()
            .as_ref()
            .filter(|f| f.session_id == session_id)
            .map(|f| (g.clone(), f.amount_vnd))
    });
    let Some((gate, quoted)) = found else {
        info!("bank payment for session {session_id} ignored: no gate is waiting for it");
        return;
    };
    let Some(quoted) = quoted else {
        warn!("bank payment for session {session_id} ignored: fee has no quoted amount");
        return;
    };

    if amount_vnd >= quoted {
        let s = Settlement {
            method: "bank_qr".into(),
            confirmed_by: "auto".into(),
            waive_reason: None,
            bank_ref: Some(bank_ref),
        };
        if let Err(e) = settle(&gate, store, publisher, &gate.hooks, session_id, s).await {
            // "already settled" / "no fee pending" is the normal race with a
            // manual settlement; the other outcomes deserve attention.
            warn!("automatic walk-in settlement for {session_id} not applied: {e}");
        }
        return;
    }

    // Short transfer: show it to the guard, do not open.
    let updated = {
        let mut pending = gate.pending_fee.lock().unwrap();
        match pending.as_mut().filter(|f| f.session_id == session_id) {
            Some(f) => {
                f.bank_received_vnd = Some(amount_vnd);
                Some(f.clone())
            }
            None => None,
        }
    };
    if let Some(f) = updated {
        gate.hooks.notify(json!({
            "plate": normalize_plate(&f.plate),
            "gateId": gate.ctx.gate_id,
            "direction": gate.ctx.lane_direction,
            "decision": "deny",
            "reason": "walk_in_fee_due",
            "sessionId": f.session_id,
            "amountVnd": f.amount_vnd,
            "bankReceivedVnd": amount_vnd,
            "at": Utc::now().to_rfc3339(),
        }));
    }
}

#[cfg(test)]
pub(crate) mod testkit {
    use super::*;
    use crate::config::GateCtx;
    use crate::fsm::{GateFsm, GateState};
    use crate::hal::{BarrierHal, HalSensors, SimulatedHal};
    use crate::incidents::IncidentReporter;
    use crate::mqtt::MemPublisher;
    use crate::telemetry::CycleCounters;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    use tokio::sync::{broadcast, mpsc, watch};

    pub const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    pub const SITE: &str = "22222222-2222-2222-2222-222222222222";
    pub const GATE: &str = "33333333-3333-3333-3333-333333333333";

    /// HAL spy counting `energize_open` calls.
    pub struct SpyHal {
        inner: SimulatedHal,
        pub opens: AtomicUsize,
    }

    impl SpyHal {
        pub fn new() -> Arc<Self> {
            Arc::new(Self {
                inner: SimulatedHal::new(),
                opens: AtomicUsize::new(0),
            })
        }
        pub fn open_count(&self) -> usize {
            self.opens.load(Ordering::SeqCst)
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

    pub struct Rig {
        pub gate: Arc<GateRuntime>,
        pub store: Arc<Store>,
        pub pub_: Arc<MemPublisher>,
        pub hal: Arc<SpyHal>,
        pub events: broadcast::Receiver<Value>,
        _dir: tempfile::TempDir,
    }

    pub fn rig(direction: &str) -> Rig {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(Store::open(&dir.path().join("edge.db")).unwrap());
        let pub_ = Arc::new(MemPublisher::new());
        let hal = SpyHal::new();
        let ctx = Arc::new(GateCtx {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            device_id: Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: None,
            lane_direction: direction.to_string(),
            camera_rtsp_url: None,
            cameras: vec![],
        });
        let (events_tx, events) = broadcast::channel(16);
        let last_event = Arc::new(Mutex::new(None));
        let pending_fee = Arc::new(Mutex::new(None));
        let (plate_tx, _plate_rx) = mpsc::channel(1);
        let (_state_tx, state_rx) = watch::channel(GateState::Closed);
        let hooks = PipelineHooks {
            events: Some(events_tx),
            last_event: Some(last_event.clone()),
            pending_fee: Some(pending_fee.clone()),
            sync: None,
        };
        let gate = Arc::new(GateRuntime {
            ctx: ctx.clone(),
            fsm: Arc::new(Mutex::new(GateFsm::new(hal.clone()))),
            hal: hal.clone(),
            incidents: Arc::new(IncidentReporter::new(pub_.clone(), ctx)),
            counters: Arc::new(CycleCounters::default()),
            plate_tx,
            state_rx,
            last_event,
            pending_fee,
            hooks,
        });
        Rig {
            gate,
            store,
            pub_,
            hal,
            events,
            _dir: dir,
        }
    }

    pub fn tariff(hourly: Option<i64>) -> StoredPricing {
        StoredPricing {
            pricing: crate::pricing::SitePricing {
                hourly_from: hourly,
                daily_from: None,
                overnight_from: None,
                grace_minutes: 0,
                block_minutes: 60,
                overnight_start_hour: 22,
                overnight_end_hour: 6,
            },
            timezone: "UTC".into(),
            bank_account: None,
            updated_at: "2026-11-16T00:00:00Z".into(),
        }
    }

    pub fn walk_in_row(plate: &str, stayed_minutes: i64) -> WalkInRow {
        WalkInRow {
            session_id: Uuid::new_v4(),
            plate_normalized: plate.into(),
            plate_number: plate.into(),
            entry_gate_id: Some(Uuid::new_v4()),
            entered_at: Utc::now() - chrono::Duration::minutes(stayed_minutes),
            entry_image_key: None,
            status: "open".into(),
            exit_gate_id: None,
            exited_at: None,
            amount_vnd: None,
            method: None,
            confirmed_by: None,
            waive_reason: None,
            bank_ref: None,
        }
    }

    /// Put an open session in the store and its quote on the gate, as the
    /// pipeline does when an admitted plate shows up at the exit.
    pub fn seed_fee_due(rig: &Rig, plate: &str, stayed_minutes: i64) -> FeeQuote {
        let row = walk_in_row(plate, stayed_minutes);
        rig.store.insert_walk_in(&row).unwrap();
        let q = quote(rig.store.site_pricing().unwrap().as_ref(), &row, Utc::now());
        *rig.gate.pending_fee.lock().unwrap() = Some(q.clone());
        q
    }

    pub fn cash() -> Settlement {
        Settlement {
            method: "cash".into(),
            confirmed_by: "manual".into(),
            waive_reason: None,
            bank_ref: None,
        }
    }

    pub fn frames_of(rig: &Rig, kind: &str) -> Vec<Value> {
        rig.pub_
            .sent
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, b, _)| b["type"] == kind)
            .map(|(_, b, _)| b.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::testkit::*;
    use super::*;
    use crate::fsm::GateState;

    #[test]
    fn pay_code_is_pv_plus_eight_hex() {
        let id = Uuid::parse_str("0a1b2c3d-0000-0000-0000-000000000000").unwrap();
        assert_eq!(pay_code(&id), "PV0A1B2C3D");
    }

    #[tokio::test]
    async fn admit_creates_session_opens_gate_and_reports_entry() {
        let rig = rig("entry");
        let id = admit(&rig.gate, &rig.store, rig.pub_.as_ref(), "29H-111.22", Some("p.jpg".into()))
            .await
            .unwrap();
        let row = rig.store.open_walk_in("29H11122").unwrap().unwrap();
        assert_eq!(row.session_id, id);
        assert_eq!(row.entry_image_key.as_deref(), Some("p.jpg"));
        assert!(matches!(
            rig.gate.fsm.lock().unwrap().state(),
            GateState::Opening | GateState::Open
        ));
        let frames = frames_of(&rig, "walk_in_entry");
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0]["sessionId"], id.to_string());
        assert_eq!(frames[0]["plateNumber"], "29H11122");
        assert_eq!(frames[0]["plateImageKey"], "p.jpg");
        assert!(frames[0]["enteredAt"].as_str().unwrap().ends_with('Z'));
    }

    #[tokio::test]
    async fn admit_on_locked_gate_creates_nothing() {
        let rig = rig("entry");
        rig.gate.fsm.lock().unwrap().lock().unwrap();
        let err = admit(&rig.gate, &rig.store, rig.pub_.as_ref(), "29H11122", None)
            .await
            .unwrap_err();
        assert!(!err.is_empty());
        assert!(rig.store.open_walk_in("29H11122").unwrap().is_none());
        assert!(frames_of(&rig, "walk_in_entry").is_empty());
        assert_eq!(rig.store.pending_count().unwrap(), 0);
    }

    #[tokio::test]
    async fn admit_twice_keeps_first_entry_time() {
        let rig = rig("entry");
        let first = admit(&rig.gate, &rig.store, rig.pub_.as_ref(), "29H11122", None)
            .await
            .unwrap();
        let entered = rig.store.walk_in(first).unwrap().unwrap().entered_at;
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        let second = admit(&rig.gate, &rig.store, rig.pub_.as_ref(), "29h-111.22", None)
            .await
            .unwrap();
        assert_eq!(first, second);
        assert_eq!(rig.store.walk_in(first).unwrap().unwrap().entered_at, entered);
        assert_eq!(frames_of(&rig, "walk_in_entry").len(), 1);
    }

    #[tokio::test]
    async fn admit_rejects_exit_gate_and_blank_plate() {
        let exit = rig("exit");
        assert_eq!(
            admit(&exit.gate, &exit.store, exit.pub_.as_ref(), "29H11122", None)
                .await
                .unwrap_err(),
            "not an entry gate"
        );
        let entry = rig("entry");
        assert_eq!(
            admit(&entry.gate, &entry.store, entry.pub_.as_ref(), " -. ", None)
                .await
                .unwrap_err(),
            "plate required"
        );
    }

    #[test]
    fn quote_without_tariff_has_no_amount() {
        let row = walk_in_row("A1", 150);
        assert_eq!(quote(None, &row, Utc::now()).amount_vnd, None);
        let no_rate = tariff(None);
        assert_eq!(quote(Some(&no_rate), &row, Utc::now()).amount_vnd, None);
    }

    #[test]
    fn quote_uses_synced_tariff() {
        let row = walk_in_row("A1", 150);
        let q = quote(Some(&tariff(Some(10_000))), &row, row.entered_at + chrono::Duration::minutes(150));
        assert_eq!(q.amount_vnd, Some(30_000));
        assert_eq!(q.duration_minutes, 150);
        assert_eq!(q.pay_code, pay_code(&row.session_id));
        assert_eq!(q.bank_received_vnd, None);
    }

    #[tokio::test]
    async fn settle_cash_closes_opens_and_reports_exit() {
        let mut rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash())
            .await
            .unwrap();

        assert_eq!(rig.hal.open_count(), 1);
        assert!(rig.gate.pending_fee.lock().unwrap().is_none());
        let row = rig.store.walk_in(q.session_id).unwrap().unwrap();
        assert_eq!(row.status, "paid");
        assert_eq!(row.amount_vnd, q.amount_vnd);
        let frames = frames_of(&rig, "walk_in_exit");
        assert_eq!(frames.len(), 1);
        let f = &frames[0];
        assert_eq!(f["amountVnd"], 30_000);
        assert_eq!(f["method"], "cash");
        assert_eq!(f["confirmedBy"], "manual");
        assert_eq!(f["sessionId"], q.session_id.to_string());
        assert!(f["enteredAt"].is_string() && f["exitedAt"].is_string());
        let last = rig.store.last_local_event("29H11122", "exit").unwrap().unwrap();
        assert_eq!((last.0.as_str(), last.1.as_str()), ("exit", "allow"));
        let ev = rig.events.try_recv().unwrap();
        assert_eq!(ev["decision"], "allow");
        assert_eq!(ev["reason"], "walk_in_paid");
        assert_eq!(ev["amountVnd"], 30_000);
        assert_eq!(ev["method"], "cash");
    }

    #[tokio::test]
    async fn settle_twice_second_is_already_settled_and_opens_once() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        let go = || settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash());
        go().await.unwrap();
        assert_eq!(go().await.unwrap_err(), "already settled");
        assert_eq!(rig.hal.open_count(), 1);
        assert_eq!(frames_of(&rig, "walk_in_exit").len(), 1);

        // a stale quote for an already-closed session must not open again
        *rig.gate.pending_fee.lock().unwrap() = Some(q.clone());
        assert_eq!(go().await.unwrap_err(), "already settled");
        assert_eq!(rig.hal.open_count(), 1);
        assert_eq!(frames_of(&rig, "walk_in_exit").len(), 1);
    }

    #[tokio::test]
    async fn settle_waived_requires_reason() {
        let rig = rig("exit");
        let q = seed_fee_due(&rig, "29H11122", 30); // no tariff at all
        let waive = |reason: Option<&str>| Settlement {
            method: "waived".into(),
            confirmed_by: "manual".into(),
            waive_reason: reason.map(String::from),
            bank_ref: None,
        };
        for bad in [None, Some("   ")] {
            let err = settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, waive(bad))
                .await
                .unwrap_err();
            assert_eq!(err, "reason required");
        }
        assert_eq!(rig.hal.open_count(), 0);
        // cash without a known amount
        assert_eq!(
            settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash())
                .await
                .unwrap_err(),
            "amount unknown"
        );
        settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, waive(Some("Xe công vụ")))
            .await
            .unwrap();
        let f = &frames_of(&rig, "walk_in_exit")[0];
        assert_eq!(f["method"], "waived");
        assert_eq!(f["amountVnd"], 0);
        assert_eq!(f["waiveReason"], "Xe công vụ");
        assert_eq!(rig.store.walk_in(q.session_id).unwrap().unwrap().status, "waived");
        assert_eq!(rig.hal.open_count(), 1);
    }

    #[tokio::test]
    async fn settle_without_pending_fee_is_refused() {
        let rig = rig("exit");
        let err = settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, Uuid::new_v4(), cash())
            .await
            .unwrap_err();
        assert_eq!(err, "no fee pending");
    }

    #[tokio::test]
    async fn settle_on_locked_gate_keeps_session_open() {
        // The FSM refuses open while Locked (and while Fault, same path).
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        rig.gate.fsm.lock().unwrap().lock().unwrap();
        let err = settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash())
            .await
            .unwrap_err();
        assert!(!err.is_empty() && err != "already settled");
        assert_eq!(rig.store.walk_in(q.session_id).unwrap().unwrap().status, "open");
        assert!(rig.gate.pending_fee.lock().unwrap().is_some(), "quote stays for a retry");
        assert!(frames_of(&rig, "walk_in_exit").is_empty());
        assert_eq!(rig.hal.open_count(), 0);
    }

    #[tokio::test]
    async fn settle_offline_enqueues_exit_frame() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        rig.pub_.set_connected(false);
        settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash())
            .await
            .unwrap();
        assert!(rig.pub_.sent.lock().unwrap().is_empty());
        let queued = rig.store.drain_events(10).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].1, "walkin");
        assert_eq!(queued[0].2["type"], "walk_in_exit");
        assert_eq!(queued[0].2["gateId"], GATE);
    }

    // ---------- Task 9: automatic bank confirmation ----------

    async fn paid(rig: &Rig, session: Uuid, amount: i64) {
        on_bank_paid_for(
            std::slice::from_ref(&rig.gate),
            &rig.store,
            rig.pub_.as_ref(),
            session,
            amount,
            "FT26321".into(),
        )
        .await
    }

    #[tokio::test]
    async fn bank_paid_full_amount_settles_and_opens() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        paid(&rig, q.session_id, 30_000).await;
        assert_eq!(rig.hal.open_count(), 1);
        let frames = frames_of(&rig, "walk_in_exit");
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0]["confirmedBy"], "auto");
        assert_eq!(frames[0]["bankRef"], "FT26321");
        assert_eq!(frames[0]["method"], "bank_qr");
        assert_eq!(frames[0]["amountVnd"], 30_000);
    }

    #[tokio::test]
    async fn bank_paid_short_amount_marks_received_and_keeps_closed() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        paid(&rig, q.session_id, 20_000).await;
        assert_eq!(rig.hal.open_count(), 0);
        assert!(matches!(rig.gate.fsm.lock().unwrap().state(), GateState::Closed));
        let pending = rig.gate.pending_fee.lock().unwrap().clone().unwrap();
        assert_eq!(pending.bank_received_vnd, Some(20_000));
        assert_eq!(rig.store.walk_in(q.session_id).unwrap().unwrap().status, "open");
        assert!(frames_of(&rig, "walk_in_exit").is_empty());
    }

    #[tokio::test]
    async fn bank_paid_after_manual_settle_is_ignored() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        settle(&rig.gate, &rig.store, rig.pub_.as_ref(), &rig.gate.hooks, q.session_id, cash())
            .await
            .unwrap();
        paid(&rig, q.session_id, 30_000).await;
        assert_eq!(rig.hal.open_count(), 1);
        assert_eq!(frames_of(&rig, "walk_in_exit").len(), 1);
    }

    #[tokio::test]
    async fn bank_paid_for_unknown_session_is_ignored() {
        let rig = rig("exit");
        rig.store.put_site_pricing(&tariff(Some(10_000))).unwrap();
        let q = seed_fee_due(&rig, "29H11122", 150);
        paid(&rig, Uuid::new_v4(), 99_000).await;
        assert_eq!(rig.hal.open_count(), 0);
        assert!(frames_of(&rig, "walk_in_exit").is_empty());
        assert_eq!(
            rig.gate.pending_fee.lock().unwrap().as_ref().unwrap().session_id,
            q.session_id
        );
    }

    #[tokio::test]
    async fn bank_paid_without_quoted_amount_is_ignored() {
        let rig = rig("exit");
        let q = seed_fee_due(&rig, "29H11122", 150); // no tariff
        paid(&rig, q.session_id, 99_000).await;
        assert_eq!(rig.hal.open_count(), 0);
        assert!(frames_of(&rig, "walk_in_exit").is_empty());
    }
}
