use chrono::{DateTime, Duration, TimeZone, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SitePricing {
    pub hourly_from: Option<i64>,
    pub daily_from: Option<i64>,
    pub overnight_from: Option<i64>,
    #[serde(default)]
    pub grace_minutes: u32,
    #[serde(default = "default_block_minutes")]
    pub block_minutes: u32,
    #[serde(default = "default_overnight_start")]
    pub overnight_start_hour: u8,
    #[serde(default = "default_overnight_end")]
    pub overnight_end_hour: u8,
}

fn default_block_minutes() -> u32 { 60 }
fn default_overnight_start() -> u8 { 22 }
fn default_overnight_end() -> u8 { 6 }

pub fn estimate_fee(
    pricing: &SitePricing,
    entered_at: DateTime<Utc>,
    exited_at: DateTime<Utc>,
    timezone: &str,
) -> Option<i64> {
    let hourly = pricing.hourly_from?;
    if exited_at <= entered_at { return Some(0); }
    let minutes = (exited_at - entered_at).num_seconds() as f64 / 60.0;
    if minutes <= pricing.grace_minutes as f64 { return Some(0); }
    let block = if pricing.block_minutes == 0 { 60 } else { pricing.block_minutes };
    let blocks = (minutes / block as f64).ceil() as i64;
    let mut fee = ((blocks as f64) * hourly as f64 * (block as f64 / 60.0)).ceil() as i64;
    if let Some(daily) = pricing.daily_from {
        let windows = (minutes / 1440.0).ceil() as i64;
        fee = fee.min(windows * daily);
    }
    if let Some(overnight) = pricing.overnight_from {
        let tz: Tz = Tz::from_str(timezone).unwrap_or(chrono_tz::UTC);
        let start_local = entered_at.with_timezone(&tz);
        let end_local = exited_at.with_timezone(&tz);
        let crossings = overnight_crossings(start_local, end_local, pricing.overnight_start_hour, pricing.overnight_end_hour);
        fee += crossings * overnight;
    }
    Some(fee)
}

fn overnight_crossings(start: DateTime<Tz>, end: DateTime<Tz>, start_hour: u8, end_hour: u8) -> i64 {
    if start_hour == end_hour || end <= start { return 0; }
    let tz = start.timezone();
    let mut day = start.date_naive() - Duration::days(1);
    let mut count = 0;
    loop {
        let date_start = day.and_hms_opt(start_hour as u32, 0, 0).unwrap();
        let ws = match tz.from_local_datetime(&date_start).single() {
            Some(dt) => dt,
            None => {
                day = day.succ_opt().unwrap();
                continue;
            }
        };
        let duration_hours = if end_hour <= start_hour { 24 - start_hour as i64 + end_hour as i64 } else { end_hour as i64 - start_hour as i64 };
        let we = ws + Duration::hours(duration_hours);
        if ws >= end { break; }
        if we > start { count += 1; }
        day = day.succ_opt().unwrap();
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn pricing(hourly: Option<i64>) -> SitePricing {
        SitePricing { hourly_from: hourly, daily_from: None, overnight_from: None, grace_minutes: 0, block_minutes: 60, overnight_start_hour: 22, overnight_end_hour: 6 }
    }

    #[derive(serde::Deserialize)]
    struct Vector {
        name: String,
        pricing: SitePricing,
        timezone: String,
        #[serde(rename = "enteredAt")]
        entered_at: DateTime<Utc>,
        #[serde(rename = "exitedAt")]
        exited_at: DateTime<Utc>,
        expected: Option<i64>,
    }

    #[test]
    fn matches_backend_vectors() {
        let raw = include_str!("../../../backend/tests/fixtures/pricing_vectors.json");
        let vectors: Vec<Vector> = serde_json::from_str(raw).expect("parse vectors");
        assert!(vectors.len() >= 12);
        for v in vectors {
            let got = estimate_fee(&v.pricing, v.entered_at, v.exited_at, &v.timezone);
            assert_eq!(got, v.expected, "vector {}", v.name);
        }
    }

    #[test]
    fn no_hourly_rate_is_not_estimable() {
        let p = pricing(None);
        let start = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        assert_eq!(estimate_fee(&p, start, start + Duration::hours(1), "UTC"), None);
    }

    #[test]
    fn bills_started_blocks_and_grace() {
        let mut p = pricing(Some(10000));
        p.grace_minutes = 15;
        let start = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        assert_eq!(estimate_fee(&p, start, start + Duration::minutes(15), "UTC"), Some(0));
        assert_eq!(estimate_fee(&p, start, start + Duration::minutes(16), "UTC"), Some(10000));
        assert_eq!(estimate_fee(&p, start, start + Duration::minutes(121), "UTC"), Some(30000));
    }

    #[test]
    fn applies_daily_cap_and_overnight_surcharge() {
        let mut p = pricing(Some(10000));
        p.daily_from = Some(25000);
        p.overnight_from = Some(5000);
        let start = Utc.with_ymd_and_hms(2026, 1, 1, 21, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2026, 1, 2, 7, 0, 0).unwrap();
        assert_eq!(estimate_fee(&p, start, end, "UTC"), Some(30000));
    }
}
