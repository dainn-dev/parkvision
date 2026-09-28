#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> EdgeConfig {
        EdgeConfig {
            tenant_id: Uuid::new_v4(),
            site_id: Uuid::new_v4(),
            gate_id: Uuid::new_v4(),
            lane_id: Some(Uuid::new_v4()),
            device_id: Uuid::new_v4(),
            api_key: "pvk_test_secret".to_string(),
            api_base_url: "https://api.example.com".to_string(),
            mqtt: MqttConfig {
                host: "mqtt.example.com".to_string(),
                port: 8883,
                username: Some("edge-a".to_string()),
                password: Some("pw".to_string()),
                tls: true,
            },
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
        }
    }

    #[test]
    fn save_then_load_returns_identical_config() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let cfg = sample_config();
        store.save(&cfg).unwrap();
        let loaded = store.load().unwrap().expect("config should exist");
        assert_eq!(serde_json::to_value(&cfg).unwrap(), serde_json::to_value(&loaded).unwrap());
    }

    #[test]
    fn load_on_missing_file_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn uppercase_direction_fails_validation() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("edge-config.json"));
        let mut cfg = sample_config();
        cfg.lane_direction = "ENTRY".to_string();
        assert!(store.save(&cfg).is_err());
    }

    #[test]
    fn api_key_is_redacted_in_debug() {
        let cfg = sample_config();
        let dbg = format!("{cfg:?}");
        assert!(!dbg.contains("pvk_test_secret"));
        assert!(dbg.contains("***"));
    }
}
