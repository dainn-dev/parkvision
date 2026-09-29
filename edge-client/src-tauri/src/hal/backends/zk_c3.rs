//! ZKTeco C3 / inBio access-control panel as a relay backend, over its
//! native TCP protocol (port 4370) — no PullSDK DLL. Protocol per the
//! reverse-engineered `zkaccess-c3` reference:
//!
//!   frame   = AA | 01 cmd len_lo len_hi [sess_lo sess_hi seq_lo seq_hi] data… | crc_lo crc_hi | 55
//!   crc     = CRC-16/ARC (poly 0xA001 reflected, init 0) over `01 … data`
//!   connect = 0x76 (session id in reply bytes 0-1); disconnect = 0x02
//!   control = 0x05 data [op=1, number, address(1 door | 2 aux), duration_s, 0]
//!   rtlog   = 0x0B → N × 16-byte records; byte 10 == 0xFF is a door/alarm
//!             status record whose bytes 4..8 hold per-door sensor state
//!             (low nibble: 1 = closed, 2 = open)
//!   reply   = cmd 0xC8 ok, 0xC9 error
//!
//! Durations are whole seconds — a 500 ms pulse becomes 1 s.

use anyhow::{anyhow, bail, Context, Result};
use async_trait::async_trait;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use crate::hal::relay::RelayBackend;

const START: u8 = 0xAA;
const END: u8 = 0x55;
const VERSION: u8 = 0x01;
pub const CMD_DISCONNECT: u8 = 0x02;
pub const CMD_CONTROL: u8 = 0x05;
pub const CMD_RTLOG: u8 = 0x0B;
pub const CMD_CONNECT: u8 = 0x76;
pub const REPLY_OK: u8 = 0xC8;
const INITIAL_SESSION: u16 = 0xFEFE;
const IO_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Which C3 terminal the barrier contact is wired to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputKind {
    /// Lock relay of door N — honours `duration` natively.
    Door,
    /// Auxiliary output N.
    Aux,
}

impl OutputKind {
    fn address(self) -> u8 {
        match self {
            OutputKind::Door => 1,
            OutputKind::Aux => 2,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputRole {
    OpenLimit,
    ClosedLimit,
}

pub fn crc16(payload: &[u8]) -> u16 {
    crc16::State::<crc16::ARC>::calculate(payload)
}

/// Build a full frame. `session` = `None` only for the very first connect.
pub fn encode(cmd: u8, session: Option<(u16, u16)>, data: &[u8]) -> Vec<u8> {
    let len = data.len() + if session.is_some() { 4 } else { 0 };
    let mut body = vec![VERSION, cmd, (len & 0xFF) as u8, (len >> 8) as u8];
    if let Some((sid, seq)) = session {
        body.extend_from_slice(&sid.to_le_bytes());
        body.extend_from_slice(&seq.to_le_bytes());
    }
    body.extend_from_slice(data);
    let crc = crc16(&body);
    let mut frame = Vec::with_capacity(body.len() + 4);
    frame.push(START);
    frame.extend(body);
    frame.extend_from_slice(&crc.to_le_bytes());
    frame.push(END);
    frame
}

/// Parsed reply: command byte and the payload after the 5-byte header
/// (includes the 4 session/seq bytes when present).
pub struct Reply {
    pub cmd: u8,
    pub payload: Vec<u8>,
}

async fn read_reply(stream: &mut TcpStream) -> Result<Reply> {
    let mut header = [0u8; 5];
    stream.read_exact(&mut header).await.context("c3 read header")?;
    if header[0] != START {
        bail!("c3 reply missing start byte");
    }
    let len = u16::from_le_bytes([header[3], header[4]]) as usize;
    let mut rest = vec![0u8; len + 3];
    stream.read_exact(&mut rest).await.context("c3 read payload")?;
    if rest[len + 2] != END {
        bail!("c3 reply missing end byte");
    }
    let mut body = header[1..].to_vec();
    body.extend_from_slice(&rest[..len]);
    let expected = crc16(&body).to_le_bytes();
    if expected != [rest[len], rest[len + 1]] {
        bail!("c3 reply crc mismatch");
    }
    Ok(Reply {
        cmd: header[2],
        payload: rest[..len].to_vec(),
    })
}

struct Session {
    stream: TcpStream,
    id: u16,
    seq: u16,
}

pub struct ZkC3 {
    addr: String,
    password: String,
    kind: OutputKind,
    doors: Vec<(u8, InputRole)>,
    session: Mutex<Option<Session>>,
}

impl ZkC3 {
    pub fn new(
        host: &str,
        port: u16,
        password: String,
        kind: OutputKind,
        doors: Vec<(u8, InputRole)>,
    ) -> Self {
        Self {
            addr: format!("{host}:{port}"),
            password,
            kind,
            doors,
            session: Mutex::new(None),
        }
    }

    async fn connect(&self) -> Result<Session> {
        let mut stream = tokio::time::timeout(IO_TIMEOUT, TcpStream::connect(&self.addr))
            .await
            .context("c3 connect timeout")?
            .with_context(|| format!("c3 connect {}", self.addr))?;
        let frame = encode(
            CMD_CONNECT,
            Some((INITIAL_SESSION, INITIAL_SESSION)),
            self.password.as_bytes(),
        );
        stream.write_all(&frame).await.context("c3 send connect")?;
        let reply = tokio::time::timeout(IO_TIMEOUT, read_reply(&mut stream))
            .await
            .context("c3 connect reply timeout")??;
        if reply.cmd != REPLY_OK {
            bail!("c3 connect rejected (reply 0x{:02X})", reply.cmd);
        }
        if reply.payload.len() < 2 {
            bail!("c3 connect reply too short");
        }
        Ok(Session {
            stream,
            id: u16::from_le_bytes([reply.payload[0], reply.payload[1]]),
            seq: INITIAL_SESSION.wrapping_add(1),
        })
    }

    /// Send one command on the live session (connecting first if needed)
    /// and return the reply payload with the 4 session/seq bytes stripped.
    /// Any failure drops the session so the next call reconnects.
    async fn exchange(&self, cmd: u8, data: &[u8]) -> Result<Vec<u8>> {
        let mut guard = self.session.lock().await;
        if guard.is_none() {
            *guard = Some(self.connect().await?);
        }
        let s = guard.as_mut().unwrap();
        let res = async {
            let frame = encode(cmd, Some((s.id, s.seq)), data);
            s.seq = s.seq.wrapping_add(1);
            s.stream.write_all(&frame).await.context("c3 send")?;
            let reply = tokio::time::timeout(IO_TIMEOUT, read_reply(&mut s.stream))
                .await
                .context("c3 reply timeout")??;
            if reply.cmd != REPLY_OK {
                return Err(anyhow!("c3 command 0x{cmd:02X} failed (reply 0x{:02X})", reply.cmd));
            }
            Ok(reply.payload.get(4..).map(<[u8]>::to_vec).unwrap_or_default())
        }
        .await;
        if res.is_err() {
            *guard = None;
        }
        res
    }

    async fn control(&self, idx: u8, duration_s: u8) -> Result<()> {
        if idx == 0 {
            bail!("output index is 1-based");
        }
        self.exchange(CMD_CONTROL, &[1, idx, self.kind.address(), duration_s, 0])
            .await?;
        Ok(())
    }
}

/// Sensor state per door from the newest door/alarm status record, if any.
pub fn door_sensors(payload: &[u8]) -> Option<[u8; 4]> {
    payload
        .chunks_exact(16)
        .filter(|r| r[10] == 0xFF)
        .last()
        .map(|r| [r[4] & 0x0F, r[5] & 0x0F, r[6] & 0x0F, r[7] & 0x0F])
}

#[async_trait]
impl RelayBackend for ZkC3 {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        self.control(idx, if on { 255 } else { 0 }).await
    }

    async fn pulse(&self, idx: u8, ms: u64) -> Result<()> {
        let secs = ms.div_ceil(1000).clamp(1, 254) as u8;
        if ms < 1000 {
            tracing::info!("zk c3: pulse {ms} ms rounded up to 1 s (panel granularity)");
        }
        self.control(idx, secs).await
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        if self.doors.is_empty() {
            return Ok(None);
        }
        let payload = self.exchange(CMD_RTLOG, &[]).await?;
        let Some(sensors) = door_sensors(&payload) else {
            // Event records only — nothing new about door state this poll.
            return Ok(Some(Vec::new()));
        };
        let n = self.doors.iter().map(|(d, _)| *d).max().unwrap_or(0) as usize;
        let mut out = vec![false; n];
        for &(door, role) in &self.doors {
            let Some(state) = (door >= 1 && door <= 4)
                .then(|| sensors[door as usize - 1])
            else {
                continue;
            };
            out[door as usize - 1] = match role {
                InputRole::OpenLimit => state == 2,
                InputRole::ClosedLimit => state == 1,
            };
        }
        Ok(Some(out))
    }

    async fn probe(&self) -> Result<()> {
        let s = self.connect().await?;
        let mut s = s;
        let frame = encode(CMD_DISCONNECT, Some((s.id, s.seq)), &[]);
        let _ = s.stream.write_all(&frame).await;
        Ok(())
    }

    fn kind(&self) -> &'static str {
        "zkC3"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};
    use tokio::net::TcpListener;

    /// Fake panel: records decoded (cmd, data) per request, replies 0xC8
    /// with the session echo plus `rtlog` bytes for RTLOG requests.
    /// `drop_after` closes the socket after that many commands (once).
    struct Fake {
        cmds: Arc<StdMutex<Vec<(u8, Vec<u8>)>>>,
        connections: Arc<StdMutex<usize>>,
    }

    async fn fake_panel(rtlog: Vec<u8>, drop_after: Option<usize>) -> (std::net::SocketAddr, Fake) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let cmds: Arc<StdMutex<Vec<(u8, Vec<u8>)>>> = Default::default();
        let connections: Arc<StdMutex<usize>> = Default::default();
        let (c2, n2) = (cmds.clone(), connections.clone());
        tokio::spawn(async move {
            let mut dropped = false;
            loop {
                let (mut s, _) = listener.accept().await.unwrap();
                *n2.lock().unwrap() += 1;
                let session: u16 = 0x1234;
                let mut served = 0;
                loop {
                    let Ok(reply) = read_reply(&mut s).await else { break };
                    let (sess, data) = (&reply.payload[..4], reply.payload[4..].to_vec());
                    let _ = sess;
                    c2.lock().unwrap().push((reply.cmd, data));
                    served += 1;
                    if !dropped && drop_after.is_some_and(|n| served >= n) {
                        dropped = true;
                        break;
                    }
                    let mut body = Vec::new();
                    body.extend_from_slice(&session.to_le_bytes());
                    body.extend_from_slice(&[0, 0]);
                    if reply.cmd == CMD_RTLOG {
                        body.extend_from_slice(&rtlog);
                    }
                    // reply frames carry cmd 0xC8; data length = body length (no extra session header)
                    let mut frame = vec![VERSION, REPLY_OK, (body.len() & 0xFF) as u8, (body.len() >> 8) as u8];
                    frame.extend(&body);
                    let crc = crc16(&frame).to_le_bytes();
                    let mut out = vec![START];
                    out.extend(frame);
                    out.extend_from_slice(&crc);
                    out.push(END);
                    s.write_all(&out).await.unwrap();
                }
            }
        });
        (addr, Fake { cmds, connections })
    }

    fn client(addr: std::net::SocketAddr, doors: Vec<(u8, InputRole)>) -> ZkC3 {
        ZkC3::new(&addr.ip().to_string(), addr.port(), "".into(), OutputKind::Aux, doors)
    }

    #[test]
    fn connect_frame_has_valid_crc_and_terminator() {
        let f = encode(CMD_CONNECT, Some((0xFEFE, 0xFEFE)), b"");
        assert_eq!(&f[..3], &[0xAA, 0x01, 0x76]);
        assert_eq!(f[3], 4); // len = 0 data + 4 session bytes
        assert_eq!(*f.last().unwrap(), 0x55);
        let body = &f[1..f.len() - 3];
        let crc = crc16(body).to_le_bytes();
        assert_eq!(&f[f.len() - 3..f.len() - 1], &crc);
    }

    #[test]
    fn crc_matches_reference_vector() {
        // CRC-16/ARC check value for "123456789" is 0xBB3D.
        assert_eq!(crc16(b"123456789"), 0xBB3D);
    }

    #[tokio::test]
    async fn pulse_rounds_up_to_one_second() {
        let (addr, fake) = fake_panel(vec![], None).await;
        let c = client(addr, vec![]);
        c.pulse(1, 500).await.unwrap();
        c.pulse(1, 2500).await.unwrap();
        let cmds = fake.cmds.lock().unwrap().clone();
        assert_eq!(cmds[0].0, CMD_CONNECT);
        assert_eq!(cmds[1], (CMD_CONTROL, vec![1, 1, 2, 1, 0]));
        assert_eq!(cmds[2], (CMD_CONTROL, vec![1, 1, 2, 3, 0]));
    }

    #[tokio::test]
    async fn set_output_latch_and_release() {
        let (addr, fake) = fake_panel(vec![], None).await;
        let c = client(addr, vec![]);
        c.set_output(2, true).await.unwrap();
        c.set_output(2, false).await.unwrap();
        let cmds = fake.cmds.lock().unwrap().clone();
        assert_eq!(cmds[1], (CMD_CONTROL, vec![1, 2, 2, 255, 0]));
        assert_eq!(cmds[2], (CMD_CONTROL, vec![1, 2, 2, 0, 0]));
    }

    #[tokio::test]
    async fn door_output_kind_uses_address_one() {
        let (addr, fake) = fake_panel(vec![], None).await;
        let c = ZkC3::new(&addr.ip().to_string(), addr.port(), "".into(), OutputKind::Door, vec![]);
        c.pulse(1, 1000).await.unwrap();
        assert_eq!(fake.cmds.lock().unwrap()[1], (CMD_CONTROL, vec![1, 1, 1, 1, 0]));
    }

    #[tokio::test]
    async fn rtlog_maps_door_sensor_to_limits() {
        // one status record: door1 sensor open (2), door2 sensor closed (1)
        let mut rec = vec![0u8; 16];
        rec[4] = 2;
        rec[5] = 1;
        rec[10] = 0xFF;
        let (addr, _fake) = fake_panel(rec, None).await;
        let c = client(addr, vec![(1, InputRole::OpenLimit), (2, InputRole::ClosedLimit)]);
        assert_eq!(c.read_inputs().await.unwrap(), Some(vec![true, true]));
    }

    #[tokio::test]
    async fn rtlog_event_only_yields_empty_snapshot() {
        let mut rec = vec![0u8; 16];
        rec[10] = 0x01; // an event, not a status record
        let (addr, _fake) = fake_panel(rec, None).await;
        let c = client(addr, vec![(1, InputRole::OpenLimit)]);
        assert_eq!(c.read_inputs().await.unwrap(), Some(vec![]));
    }

    #[tokio::test]
    async fn no_doors_configured_yields_none() {
        let (addr, _fake) = fake_panel(vec![], None).await;
        let c = client(addr, vec![]);
        assert_eq!(c.read_inputs().await.unwrap(), None);
    }

    #[tokio::test]
    async fn reconnects_after_server_drop() {
        let (addr, fake) = fake_panel(vec![], Some(2)).await; // connect + first control, then drop
        let c = client(addr, vec![]);
        assert!(c.set_output(1, true).await.is_err());
        c.set_output(1, true).await.unwrap();
        assert_eq!(*fake.connections.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn probe_connects_and_disconnects() {
        let (addr, fake) = fake_panel(vec![], None).await;
        let c = client(addr, vec![]);
        c.probe().await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let cmds = fake.cmds.lock().unwrap().clone();
        assert_eq!(cmds[0].0, CMD_CONNECT);
        assert_eq!(cmds[1].0, CMD_DISCONNECT);
    }
}
