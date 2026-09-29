//! LCUS-x USB relay boards (CH340 serial, 9600 8N1). One 4-byte frame per
//! channel: `A0 <idx> <state> <checksum>` where checksum = sum of the first
//! three bytes & 0xFF. No inputs.

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::hal::relay::RelayBackend;

type Port = Box<dyn AsyncWriteStream>;

pub trait AsyncWriteStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> AsyncWriteStream for T {}

pub struct LcusRelay {
    port: Mutex<Port>,
}

pub fn lcus_frame(idx: u8, on: bool) -> [u8; 4] {
    let state = on as u8;
    [0xA0, idx, state, (0xA0u16 + idx as u16 + state as u16) as u8]
}

impl LcusRelay {
    pub fn new(port: &str, baud: u32) -> Result<Self> {
        use tokio_serial::SerialPortBuilderExt;
        let stream = tokio_serial::new(port, baud)
            .open_native_async()
            .with_context(|| format!("open serial port {port}"))?;
        Ok(Self::from_stream(stream))
    }

    pub fn from_stream<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(s: S) -> Self {
        Self {
            port: Mutex::new(Box::new(s)),
        }
    }
}

#[async_trait]
impl RelayBackend for LcusRelay {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        if idx == 0 {
            bail!("output index is 1-based");
        }
        let mut port = self.port.lock().await;
        port.write_all(&lcus_frame(idx, on))
            .await
            .context("lcus write")?;
        port.flush().await.context("lcus flush")?;
        Ok(())
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        Ok(None)
    }

    async fn probe(&self) -> Result<()> {
        Ok(())
    }

    fn kind(&self) -> &'static str {
        "serial/lcus"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[tokio::test]
    async fn lcus_frame_bytes() {
        let (a, mut b) = tokio::io::duplex(64);
        let relay = LcusRelay::from_stream(a);
        relay.set_output(2, true).await.unwrap();
        let mut buf = [0u8; 4];
        b.read_exact(&mut buf).await.unwrap();
        assert_eq!(buf, [0xA0, 0x02, 0x01, 0xA3]);
        relay.set_output(1, false).await.unwrap();
        b.read_exact(&mut buf).await.unwrap();
        assert_eq!(buf, [0xA0, 0x01, 0x00, 0xA1]);
    }

    #[tokio::test]
    async fn lcus_has_no_inputs() {
        let (a, _b) = tokio::io::duplex(64);
        let relay = LcusRelay::from_stream(a);
        assert_eq!(relay.read_inputs().await.unwrap(), None);
    }

    #[tokio::test]
    async fn closed_port_is_error() {
        let (a, b) = tokio::io::duplex(64);
        drop(b);
        let relay = LcusRelay::from_stream(a);
        assert!(relay.set_output(1, true).await.is_err());
    }
}
