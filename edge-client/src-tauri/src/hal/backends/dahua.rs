//! Dahua CGI alarm outputs as a relay backend.
//!   default: configManager.cgi setConfig AlarmOut[n-1].Mode = 1 (force on) | 2 (force off)
//!   strobe:  trafficSnap.cgi openStrobe (ITC traffic cameras; pulse only)
//!   inputs:  alarm.cgi getInState → `result=<bitmask>`

use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Method;

use super::digest::DigestClient;
use crate::hal::relay::RelayBackend;

pub struct DahuaCgi {
    base: String,
    http: DigestClient,
    strobe: bool,
    input_count: u8,
}

impl DahuaCgi {
    pub fn new(
        host: &str,
        port: u16,
        user: &str,
        pass: &str,
        strobe: bool,
        input_count: u8,
    ) -> Result<Self> {
        Ok(Self {
            base: format!("http://{host}:{port}"),
            http: DigestClient::new(user, pass)?,
            strobe,
            input_count,
        })
    }

    #[cfg(test)]
    pub fn with_base(base: &str, user: &str, pass: &str, strobe: bool, input_count: u8) -> Self {
        Self {
            base: base.trim_end_matches('/').to_string(),
            http: DigestClient::new(user, pass).unwrap(),
            strobe,
            input_count,
        }
    }

    async fn get(&self, path_and_query: &str) -> Result<String> {
        let resp = self
            .http
            .send(Method::GET, &format!("{}{path_and_query}", self.base), None)
            .await?;
        Ok(resp.text().await?)
    }
}

#[async_trait]
impl RelayBackend for DahuaCgi {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()> {
        if idx == 0 {
            bail!("output index is 1-based");
        }
        if self.strobe {
            if on {
                self.get(&format!(
                    "/cgi-bin/trafficSnap.cgi?action=openStrobe&channel={idx}&info.openType=Normal"
                ))
                .await?;
            }
            return Ok(());
        }
        let mode = if on { 1 } else { 2 };
        self.get(&format!(
            "/cgi-bin/configManager.cgi?action=setConfig&AlarmOut[{}].Mode={mode}",
            idx - 1
        ))
        .await?;
        Ok(())
    }

    async fn read_inputs(&self) -> Result<Option<Vec<bool>>> {
        if self.input_count == 0 {
            return Ok(None);
        }
        let text = self.get("/cgi-bin/alarm.cgi?action=getInState").await?;
        let mask = text
            .lines()
            .find_map(|l| l.trim().strip_prefix("result="))
            .and_then(|v| v.trim().parse::<u32>().ok());
        let Some(mask) = mask else {
            bail!("unexpected getInState body");
        };
        Ok(Some(
            (0..self.input_count).map(|i| mask & (1 << i) != 0).collect(),
        ))
    }

    async fn probe(&self) -> Result<()> {
        self.get("/cgi-bin/magicBox.cgi?action=getDeviceType").await?;
        Ok(())
    }

    fn kind(&self) -> &'static str {
        "dahua"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    #[tokio::test]
    async fn set_output_uses_alarm_out_mode() {
        let server = MockServer::start();
        let on = server.mock(|when, then| {
            when.method(GET)
                .path("/cgi-bin/configManager.cgi")
                .query_param("action", "setConfig")
                .query_param("AlarmOut[0].Mode", "1");
            then.status(200).body("OK");
        });
        let off = server.mock(|when, then| {
            when.method(GET)
                .path("/cgi-bin/configManager.cgi")
                .query_param("AlarmOut[0].Mode", "2");
            then.status(200).body("OK");
        });
        let b = DahuaCgi::with_base(&server.base_url(), "admin", "pw", false, 0);
        b.set_output(1, true).await.unwrap();
        b.set_output(1, false).await.unwrap();
        on.assert_hits(1);
        off.assert_hits(1);
    }

    #[tokio::test]
    async fn strobe_mode_calls_traffic_snap() {
        let server = MockServer::start();
        let m = server.mock(|when, then| {
            when.method(GET)
                .path("/cgi-bin/trafficSnap.cgi")
                .query_param("action", "openStrobe")
                .query_param("channel", "1")
                .query_param("info.openType", "Normal");
            then.status(200).body("OK");
        });
        let b = DahuaCgi::with_base(&server.base_url(), "admin", "pw", true, 0);
        b.set_output(1, true).await.unwrap();
        b.set_output(1, false).await.unwrap(); // no request for OFF
        m.assert_hits(1);
    }

    #[tokio::test]
    async fn read_inputs_parses_bitmask() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.method(GET)
                .path("/cgi-bin/alarm.cgi")
                .query_param("action", "getInState");
            then.status(200).body("result=5\r\n");
        });
        let b = DahuaCgi::with_base(&server.base_url(), "admin", "pw", false, 3);
        assert_eq!(b.read_inputs().await.unwrap(), Some(vec![true, false, true]));
    }

    #[tokio::test]
    async fn non_2xx_is_error() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.any_request();
            then.status(500);
        });
        let b = DahuaCgi::with_base(&server.base_url(), "admin", "pw", false, 0);
        assert!(b.set_output(1, true).await.is_err());
    }
}
