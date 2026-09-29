//! Hikvision ISAPI alarm outputs/inputs as a relay backend.
//!   PUT /ISAPI/System/IO/outputs/{n}/trigger  <outputState>high|low</outputState>
//!   GET /ISAPI/System/IO/inputs/{n}/status     <ioState>active|inactive</ioState>

use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Method;

use super::digest::DigestClient;
use crate::hal::relay::RelayBackend;

pub struct HikvisionIsapi {
    base: String,
    http: DigestClient,
    /// 1-based input indices to poll; empty → `read_inputs` yields `None`.
    inputs: Vec<u8>,
}

impl HikvisionIsapi {
    pub fn new(host: &str, port: u16, user: &str, pass: &str, inputs: Vec<u8>) -> Result<Self> {
        Ok(Self {
            base: format!("http://{host}:{port}"),
            http: DigestClient::new(user, pass)?,
            inputs,
        })
    }

    #[cfg(test)]
    pub fn with_base(base: &str, user: &str, pass: &str, inputs: Vec<u8>) -> Self {
        Self {
            base: base.trim_end_matches('/').to_string(),
            http: DigestClient::new(user, pass).unwrap(),
            inputs,
        }
    }
}

#[async_trait]
impl RelayBackend for HikvisionIsapi {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        if idx == 0 {
            bail!("output index is 1-based");
        }
        let state = if on { "high" } else { "low" };
        let body = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><IOPortData version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema"><outputState>{state}</outputState></IOPortData>"#
        );
        self.http
            .send(
                Method::PUT,
                &format!("{}/ISAPI/System/IO/outputs/{idx}/trigger", self.base),
                Some(body),
            )
            .await?;
        Ok(())
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        let Some(&max) = self.inputs.iter().max() else {
            return Ok(None);
        };
        let mut out = vec![false; max as usize];
        for &idx in &self.inputs {
            let resp = self
                .http
                .send(
                    Method::GET,
                    &format!("{}/ISAPI/System/IO/inputs/{idx}/status", self.base),
                    None,
                )
                .await?;
            let text = resp.text().await?;
            out[idx as usize - 1] = text.contains("<ioState>active</ioState>");
        }
        Ok(Some(out))
    }

    async fn probe(&self) -> Result<()> {
        self.http
            .send(Method::GET, &format!("{}/ISAPI/System/IO/outputs", self.base), None)
            .await?;
        Ok(())
    }

    fn kind(&self) -> &'static str {
        "hikvision"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    #[tokio::test]
    async fn set_output_puts_trigger_xml() {
        let server = MockServer::start();
        let hi = server.mock(|when, then| {
            when.method(PUT)
                .path("/ISAPI/System/IO/outputs/2/trigger")
                .body_contains("<outputState>high</outputState>");
            then.status(200);
        });
        let lo = server.mock(|when, then| {
            when.method(PUT)
                .path("/ISAPI/System/IO/outputs/2/trigger")
                .body_contains("<outputState>low</outputState>");
            then.status(200);
        });
        let b = HikvisionIsapi::with_base(&server.base_url(), "admin", "pw", vec![]);
        b.set_output(2, true).await.unwrap();
        b.set_output(2, false).await.unwrap();
        hi.assert_hits(1);
        lo.assert_hits(1);
    }

    #[tokio::test]
    async fn read_inputs_maps_active_to_true() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.method(GET).path("/ISAPI/System/IO/inputs/1/status");
            then.status(200).body(
                "<IOPortStatus><ioPortID>1</ioPortID><ioPortType>input</ioPortType><ioState>active</ioState></IOPortStatus>",
            );
        });
        server.mock(|when, then| {
            when.method(GET).path("/ISAPI/System/IO/inputs/3/status");
            then.status(200)
                .body("<IOPortStatus><ioState>inactive</ioState></IOPortStatus>");
        });
        let b = HikvisionIsapi::with_base(&server.base_url(), "admin", "pw", vec![1, 3]);
        assert_eq!(b.read_inputs().await.unwrap(), Some(vec![true, false, false]));
    }

    #[tokio::test]
    async fn no_inputs_configured_yields_none() {
        let b = HikvisionIsapi::with_base("http://127.0.0.1:9", "a", "b", vec![]);
        assert_eq!(b.read_inputs().await.unwrap(), None);
    }

    #[tokio::test]
    async fn probe_hits_outputs_list() {
        let server = MockServer::start();
        let m = server.mock(|when, then| {
            when.method(GET).path("/ISAPI/System/IO/outputs");
            then.status(200).body("<IOOutputPortList/>");
        });
        let b = HikvisionIsapi::with_base(&server.base_url(), "admin", "pw", vec![]);
        b.probe().await.unwrap();
        m.assert_hits(1);
    }
}
