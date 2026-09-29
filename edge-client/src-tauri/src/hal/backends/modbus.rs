//! Modbus relay modules — RTU over a serial port or TCP. Outputs are coils
//! (FC05), feedback is discrete inputs (FC02). One lazily-opened
//! connection; any error drops it so the next call reconnects.

use std::net::SocketAddr;

use anyhow::{anyhow, bail, Context, Result};
use async_trait::async_trait;
use tokio::sync::Mutex;
use tokio_modbus::client::{Context as ModbusCtx, Reader, Writer};
use tokio_modbus::Slave;

use crate::hal::relay::RelayBackend;

#[derive(Clone)]
enum Link {
    Tcp { addr: String, unit: u8 },
    Rtu { port: String, baud: u32, unit: u8 },
}

pub struct ModbusRelay {
    link: Link,
    /// Highest input index to read; 0 → no inputs.
    input_count: u16,
    ctx: Mutex<Option<ModbusCtx>>,
}

impl ModbusRelay {
    pub fn tcp(host: &str, port: u16, unit: u8, input_count: u16) -> Self {
        Self {
            link: Link::Tcp {
                addr: format!("{host}:{port}"),
                unit,
            },
            input_count,
            ctx: Mutex::new(None),
        }
    }

    pub fn rtu(port: &str, baud: u32, unit: u8, input_count: u16) -> Self {
        Self {
            link: Link::Rtu {
                port: port.to_string(),
                baud,
                unit,
            },
            input_count,
            ctx: Mutex::new(None),
        }
    }

    async fn connect(&self) -> Result<ModbusCtx> {
        match &self.link {
            Link::Tcp { addr, unit } => {
                let sa: SocketAddr = tokio::net::lookup_host(addr)
                    .await
                    .with_context(|| format!("resolve {addr}"))?
                    .next()
                    .ok_or_else(|| anyhow!("no address for {addr}"))?;
                let stream = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    tokio::net::TcpStream::connect(sa),
                )
                .await
                .context("modbus tcp connect timeout")?
                .context("modbus tcp connect")?;
                Ok(tokio_modbus::client::tcp::attach_slave(stream, Slave(*unit)))
            }
            Link::Rtu { port, baud, unit } => {
                use tokio_serial::SerialPortBuilderExt;
                let stream = tokio_serial::new(port, *baud)
                    .open_native_async()
                    .with_context(|| format!("open serial port {port}"))?;
                Ok(tokio_modbus::client::rtu::attach_slave(stream, Slave(*unit)))
            }
        }
    }

    /// Run `op` on the live context, (re)connecting first; drop the
    /// context on any failure so the next call starts clean.
    async fn with_ctx<T, F>(&self, op: F) -> Result<T>
    where
        F: for<'a> FnOnce(&'a mut ModbusCtx) -> futures::future::BoxFuture<'a, Result<T>>,
    {
        let mut guard = self.ctx.lock().await;
        if guard.is_none() {
            *guard = Some(self.connect().await?);
        }
        let res = op(guard.as_mut().unwrap()).await;
        if res.is_err() {
            *guard = None;
        }
        res
    }
}

fn flatten<T>(r: tokio_modbus::Result<T>) -> Result<T> {
    match r {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(exc)) => bail!("modbus exception: {exc}"),
        Err(e) => Err(anyhow!("modbus: {e}")),
    }
}

#[async_trait]
impl RelayBackend for ModbusRelay {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        if idx == 0 {
            bail!("output index is 1-based");
        }
        self.with_ctx(|c| Box::pin(async move { flatten(c.write_single_coil(idx as u16 - 1, on).await) }))
            .await
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        if self.input_count == 0 {
            return Ok(None);
        }
        let n = self.input_count;
        let bits = self
            .with_ctx(|c| Box::pin(async move { flatten(c.read_discrete_inputs(0, n).await) }))
            .await?;
        Ok(Some(bits.into_iter().take(n as usize).collect()))
    }

    async fn probe(&self) -> Result<()> {
        self.with_ctx(|c| Box::pin(async move { flatten(c.read_coils(0, 1).await).map(|_| ()) }))
            .await
    }

    fn kind(&self) -> &'static str {
        match self.link {
            Link::Tcp { .. } => "modbusTcp",
            Link::Rtu { .. } => "serial/modbusRtu",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Minimal Modbus/TCP responder: records PDUs, answers FC05 by echo and
    /// FC02 with `inputs`. `drop_after` closes the connection after that
    /// many requests (once), to exercise reconnect.
    struct Fake {
        pdus: Arc<StdMutex<Vec<Vec<u8>>>>,
        connections: Arc<StdMutex<usize>>,
    }

    async fn fake_server(inputs: Vec<bool>, drop_after: Option<usize>) -> (SocketAddr, Fake) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let pdus: Arc<StdMutex<Vec<Vec<u8>>>> = Default::default();
        let connections: Arc<StdMutex<usize>> = Default::default();
        let (p2, c2) = (pdus.clone(), connections.clone());
        tokio::spawn(async move {
            let mut dropped = false;
            loop {
                let (mut s, _) = listener.accept().await.unwrap();
                *c2.lock().unwrap() += 1;
                let mut served = 0usize;
                loop {
                    let mut mbap = [0u8; 7];
                    if s.read_exact(&mut mbap).await.is_err() {
                        break;
                    }
                    let len = u16::from_be_bytes([mbap[4], mbap[5]]) as usize - 1;
                    let mut pdu = vec![0u8; len];
                    s.read_exact(&mut pdu).await.unwrap();
                    p2.lock().unwrap().push(pdu.clone());
                    served += 1;
                    if !dropped && drop_after.is_some_and(|n| served >= n) {
                        dropped = true;
                        break; // close without answering
                    }
                    let resp_pdu: Vec<u8> = match pdu[0] {
                        0x05 => pdu.clone(),
                        0x02 => {
                            let qty = u16::from_be_bytes([pdu[3], pdu[4]]) as usize;
                            let nbytes = (qty + 7) / 8;
                            let mut bytes = vec![0u8; nbytes];
                            for (i, b) in inputs.iter().enumerate().take(qty) {
                                if *b {
                                    bytes[i / 8] |= 1 << (i % 8);
                                }
                            }
                            let mut v = vec![0x02, nbytes as u8];
                            v.extend(bytes);
                            v
                        }
                        0x01 => vec![0x01, 1, 0],
                        _ => vec![pdu[0] | 0x80, 1],
                    };
                    let mut out = Vec::new();
                    out.extend_from_slice(&mbap[0..4]);
                    out.extend_from_slice(&((resp_pdu.len() + 1) as u16).to_be_bytes());
                    out.push(mbap[6]);
                    out.extend(resp_pdu);
                    s.write_all(&out).await.unwrap();
                }
            }
        });
        (addr, Fake { pdus, connections })
    }

    #[tokio::test]
    async fn modbus_tcp_writes_coil_and_reads_inputs() {
        let (addr, fake) = fake_server(vec![true, false, false, true], None).await;
        let relay = ModbusRelay::tcp(&addr.ip().to_string(), addr.port(), 1, 4);
        relay.set_output(3, true).await.unwrap();
        assert_eq!(
            relay.read_inputs().await.unwrap(),
            Some(vec![true, false, false, true])
        );
        let pdus = fake.pdus.lock().unwrap().clone();
        assert_eq!(pdus[0], vec![0x05, 0x00, 0x02, 0xFF, 0x00]);
        assert_eq!(pdus[1], vec![0x02, 0x00, 0x00, 0x00, 0x04]);
    }

    #[tokio::test]
    async fn zero_inputs_yields_none() {
        let (addr, _fake) = fake_server(vec![], None).await;
        let relay = ModbusRelay::tcp(&addr.ip().to_string(), addr.port(), 1, 0);
        assert_eq!(relay.read_inputs().await.unwrap(), None);
    }

    #[tokio::test]
    async fn modbus_reconnects_after_error() {
        let (addr, fake) = fake_server(vec![], Some(1)).await;
        let relay = ModbusRelay::tcp(&addr.ip().to_string(), addr.port(), 1, 0);
        assert!(relay.set_output(1, true).await.is_err());
        relay.set_output(1, true).await.unwrap();
        assert_eq!(*fake.connections.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn unreachable_host_is_error_not_panic() {
        let relay = ModbusRelay::tcp("127.0.0.1", 1, 1, 0);
        assert!(relay.probe().await.is_err());
    }
}
