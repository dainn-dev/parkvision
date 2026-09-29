//! HTTP Digest helper for camera CGI/ISAPI endpoints. Cameras answer the
//! first request with 401 + `WWW-Authenticate: Digest …`; we compute the
//! response and resend once. Credentials never appear in errors or logs.

use anyhow::{bail, Context, Result};
use digest_auth::{AuthContext, HttpMethod, WwwAuthenticateHeader};
use reqwest::{Client, Method, Response, StatusCode};

pub struct DigestClient {
    client: Client,
    user: String,
    pass: String,
}

impl DigestClient {
    pub fn new(user: impl Into<String>, pass: impl Into<String>) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .context("http client")?;
        Ok(Self {
            client,
            user: user.into(),
            pass: pass.into(),
        })
    }

    /// Send `method url` with an optional body; on 401 Digest challenge,
    /// authorise and retry once. Any non-2xx final status is an error that
    /// names the status only.
    pub async fn send(&self, method: Method, url: &str, body: Option<String>) -> Result<Response> {
        let first = self
            .request(method.clone(), url, body.clone(), None)
            .send()
            .await
            .context("http send")?;
        let resp = if first.status() == StatusCode::UNAUTHORIZED {
            let challenge = first
                .headers()
                .get(reqwest::header::WWW_AUTHENTICATE)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string)
                .filter(|v| v.to_ascii_lowercase().starts_with("digest"));
            let Some(challenge) = challenge else {
                bail!("http 401 without digest challenge");
            };
            let uri = reqwest::Url::parse(url).context("url")?;
            let path_q = match uri.query() {
                Some(q) => format!("{}?{}", uri.path(), q),
                None => uri.path().to_string(),
            };
            let ctx = AuthContext::new_with_method(
                self.user.as_str(),
                self.pass.as_str(),
                path_q.as_str(),
                body.as_deref().map(str::as_bytes),
                HttpMethod::from(method.as_str()),
            );
            let mut prompt = WwwAuthenticateHeader::parse(&challenge).context("digest challenge")?;
            let header = prompt.respond(&ctx).context("digest response")?;
            self.request(method, url, body, Some(header.to_header_string()))
                .send()
                .await
                .context("http send (digest)")?
        } else {
            first
        };
        if !resp.status().is_success() {
            bail!("http {}", resp.status().as_u16());
        }
        Ok(resp)
    }

    fn request(
        &self,
        method: Method,
        url: &str,
        body: Option<String>,
        auth: Option<String>,
    ) -> reqwest::RequestBuilder {
        let mut rb = self.client.request(method, url);
        if let Some(a) = auth {
            rb = rb.header(reqwest::header::AUTHORIZATION, a);
        }
        if let Some(b) = body {
            rb = rb.header(reqwest::header::CONTENT_TYPE, "application/xml").body(b);
        }
        rb
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    #[tokio::test]
    async fn retries_with_digest_after_401() {
        let server = MockServer::start();
        let challenge = server.mock(|when, then| {
            when.method(GET)
                .path("/probe")
                .matches(|req| {
                    !req.headers
                        .as_ref()
                        .is_some_and(|h| h.iter().any(|(k, _)| k.eq_ignore_ascii_case("authorization")))
                });
            then.status(401).header(
                "WWW-Authenticate",
                r#"Digest realm="cam", nonce="abc123", qop="auth""#,
            );
        });
        let ok = server.mock(|when, then| {
            when.method(GET).path("/probe").matches(|req| {
                req.headers.as_ref().is_some_and(|h| {
                    h.iter().any(|(k, v)| {
                        k.eq_ignore_ascii_case("authorization")
                            && v.starts_with("Digest username=\"admin\"")
                            && v.contains("realm=\"cam\"")
                            && v.contains("uri=\"/probe\"")
                    })
                })
            });
            then.status(200).body("ok");
        });
        let c = DigestClient::new("admin", "pw").unwrap();
        let resp = c.send(Method::GET, &server.url("/probe"), None).await.unwrap();
        assert_eq!(resp.status(), 200);
        challenge.assert_hits(1);
        ok.assert_hits(1);
    }

    #[tokio::test]
    async fn non_2xx_is_error_without_credentials() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.path("/x");
            then.status(500);
        });
        let c = DigestClient::new("admin", "topsecret").unwrap();
        let err = c.send(Method::GET, &server.url("/x"), None).await.unwrap_err();
        let msg = format!("{err:#}");
        assert!(msg.contains("500"), "{msg}");
        assert!(!msg.contains("topsecret"));
    }
}
