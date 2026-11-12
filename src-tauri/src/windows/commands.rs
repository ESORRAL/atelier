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

/// contracts/ipc.md §15 ter: returns `"panel"`, or the fallback used when the panel could not be
/// installed (`"browser"` for Shorts, `"window"` for Instagram).
#[tauri::command]
pub async fn pause_panel_toggle(
    app: AppHandle,
    site: String,
    open: bool,
) -> Result<String, String> {
    let site = super::panel::Site::parse(&site).ok_or("Panneau inconnu.")?;
    super::panel::toggle(app, site, open).await.map(Into::into)
}

/// contracts/ipc.md §16: fixed addresses, a panel's own address is never read.
fn browser_url(site: &str) -> Option<&'static str> {
    match site {
        "shorts" => Some("https://www.youtube.com/shorts"),
        "instagram" => Some("https://www.instagram.com/"),
        _ => None,
    }
}

#[tauri::command]
pub fn pause_open_browser(site: String) -> Result<(), String> {
    crate::desktop::open_detached(browser_url(&site).ok_or("Panneau inconnu.")?)
}

#[cfg(test)]
mod tests {
    #[test]
    fn browser_urls_are_fixed() {
        assert_eq!(
            super::browser_url("shorts"),
            Some("https://www.youtube.com/shorts")
        );
        assert_eq!(
            super::browser_url("instagram"),
            Some("https://www.instagram.com/")
        );
        assert_eq!(super::browser_url("https://example.com"), None);
    }
}
