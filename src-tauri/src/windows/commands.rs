//! Tauri commands of contracts/ipc.md §13.
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::{LABEL, START_URL, filter};

// async: building a window from a sync command can deadlock the event loop.
#[tauri::command]
pub async fn pause_window_open(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.show().map_err(|e| e.to_string())?;
        return w.set_focus().map_err(|e| e.to_string());
    }
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("instagram-webview");
    let url = START_URL.parse().map_err(|_| "URL de départ invalide.")?;
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("Instagram")
        .inner_size(480.0, 860.0)
        .data_directory(data_dir)
        .on_navigation(filter)
        .on_new_window(|url, _| {
            filter(&url);
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pause_window_close(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(LABEL) {
        Some(w) => w.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// contracts/ipc.md §15: returns `"panel"` or `"window"`.
#[tauri::command]
pub async fn pause_panel_toggle(app: AppHandle, open: bool) -> Result<String, String> {
    let mode = app
        .state::<crate::claude::Claude>()
        .settings_get()?
        .instagram_mode;
    super::panel::toggle(app, mode, open).await.map(Into::into)
}
