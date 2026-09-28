pub mod commands;
pub mod config;
pub mod fsm;
pub mod hal;
pub mod incidents;
pub mod mqtt;
pub mod payloads;
pub mod store;
pub mod sync;
pub mod telemetry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_config_dir()?;
            app.manage(config::SharedConfigStore::new(Some(
                config::ConfigStore::new(dir.join("edge-config.json")),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
