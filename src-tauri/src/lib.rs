pub mod claude;
pub mod notify;
pub mod store;
pub mod supervisor;

use tauri::Manager;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use claude::commands::*;
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let store = store::Store::open(app.path().app_data_dir()?)?;
            app.manage(claude::Claude::new(store));
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                let claude = window.state::<claude::Claude>();
                tauri::async_runtime::block_on(claude.close_all());
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            session_start,
            session_send,
            session_interrupt,
            session_set_model,
            session_set_permission_mode,
            session_models,
            permission_respond,
            session_close,
            sessions_list,
            session_history,
            settings_get,
            settings_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Atelier");
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_version_matches_cargo() {
        assert_eq!(super::app_version(), env!("CARGO_PKG_VERSION"));
    }
}
