pub mod claude;
pub mod desktop;
pub mod music;
pub mod notify;
pub mod project;
pub mod store;
pub mod supervisor;
pub mod vault;
pub mod windows;

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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let store = store::Store::open(app.path().app_data_dir()?)?;
            app.manage(claude::Claude::new(store));
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                let claude = window.state::<claude::Claude>();
                tauri::async_runtime::block_on(claude.close_all());
                // Otherwise Atelier keeps running with only Instagram left.
                let _ = windows::commands::pause_window_close(window.app_handle().clone());
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
            usage_summary,
            music::commands::music_players,
            music::commands::music_status,
            music::commands::music_control,
            music::commands::music_set_volume,
            desktop::pick_folder,
            desktop::music_open,
            windows::commands::pause_window_open,
            windows::commands::pause_window_close,
            vault::commands::vault_list,
            vault::commands::vault_read,
            vault::commands::vault_search,
            vault::commands::vault_open,
            vault::commands::vault_append_journal,
            project::commands::project_info,
            project::commands::graph_summary,
            project::commands::graph_update,
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
