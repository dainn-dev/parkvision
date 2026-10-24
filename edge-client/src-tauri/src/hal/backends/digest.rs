//! HTTP Digest helper for camera CGI/ISAPI endpoints. Cameras answer the
//! first request with 401 + `WWW-Authenticate: Digest …`; we compute the
//! response and resend once. Credentials never appear in errors or logs.

use anyhow::{bail, Context, Result};
use digest_auth::{AuthContext, HttpMethod, WwwAuthenticateHeader};
use reqwest::{Client, Method, Response, StatusCode};

/// Minimal base64 encoder for Basic auth — avoids pulling in an extra crate.
fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[((triple >> 18) & 0x3F) as usize] as char);
        out.push(ALPHABET[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(ALPHABET[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(ALPHABET[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

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
                .map(str::to_string);
            let Some(challenge) = challenge else {
                bail!("http 401 without WWW-Authenticate challenge");
            };
            let scheme = challenge.split_whitespace().next().unwrap_or_default();
            if scheme.eq_ignore_ascii_case("basic") {
                let credentials = format!("{}:{}", self.user, self.pass);
                let header = format!("Basic {}", base64_encode(credentials.as_bytes()));
                self.request(method, url, body, Some(header))
                    .send()
                    .await
                    .context("http send (basic)")?
            } else if scheme.eq_ignore_ascii_case("digest") {
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
                bail!("http 401 with unsupported WWW-Authenticate scheme '{scheme}'");
            }
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

    #[test]
    fn base64_encodes_basic_auth_credentials() {
        assert_eq!(base64_encode(b"admin:pw"), "YWRtaW46cHc=");
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
    }

    #[tokio::test]
    async fn retries_with_basic_after_401() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.method(GET).path("/probe").matches(|req| {
                !req.headers
                    .as_ref()
                    .is_some_and(|h| h.iter().any(|(k, _)| k.eq_ignore_ascii_case("authorization")))
            });
            then.status(401)
                .header("WWW-Authenticate", r#"Basic realm="x""#);
        });
        let ok = server.mock(|when, then| {
            when.method(GET).path("/probe").header("authorization", "Basic YWRtaW46cHc=");
            then.status(200).body("ok");
        });

        let client = DigestClient::new("admin", "pw").unwrap();
        let response = client
            .send(Method::GET, &server.url("/probe"), None)
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        ok.assert_hits(1);
    }

    #[tokio::test]
    async fn unsupported_auth_challenge_names_scheme() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.path("/probe");
            then.status(401)
                .header("WWW-Authenticate", r#"Bearer realm="x""#);
        });
        let client = DigestClient::new("admin", "pw").unwrap();
        let err = client
            .send(Method::GET, &server.url("/probe"), None)
            .await
            .unwrap_err();
        assert!(format!("{err:#}").contains("unsupported WWW-Authenticate scheme 'Bearer'"));
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
