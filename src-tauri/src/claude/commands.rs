//! Tauri commands of contracts/ipc.md §1.

use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use super::{Claude, Image, SessionEvent, StartArgs, bridge_path};
use crate::store::usage::{self, UsageSummary};
use crate::store::{PermissionMode, SessionEntry, Settings};

type Res<T> = Result<T, String>;

// shortcut: a Tauri command takes its arguments one by one (ipc.md §1), a struct would change the contract; group them if one more is added.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn session_start(
    app: AppHandle,
    claude: State<'_, Claude>,
    cwd: String,
    model: Option<String>,
    permission_mode: PermissionMode,
    resume: Option<String>,
    on_event: Channel<SessionEvent>,
    effort: Option<String>,
) -> Res<String> {
    let bridge = bridge_path(app.path().resource_dir().ok())?;
    eprintln!("[claude] bridge: {}", bridge.display());
    let tracker = std::sync::Mutex::new(crate::notify::Tracker::default());
    let key_cell = Arc::new(std::sync::OnceLock::<String>::new());
    let cell = key_cell.clone();
    let sink = Arc::new(move |ev: SessionEvent| {
        crate::notify::on_event(&app, &tracker, &cell, &ev);
        if let Err(e) = on_event.send(ev) {
            eprintln!("[claude] channel: {e}");
        }
    });
    let args = StartArgs {
        cwd,
        model,
        effort,
        permission_mode,
        resume,
    };
    let key = claude.start_with_bridge(args, &bridge, sink).await?;
    let _ = key_cell.set(key.clone());
    Ok(key)
}

#[tauri::command]
pub async fn session_send(
    claude: State<'_, Claude>,
    key: String,
    text: String,
    images: Option<Vec<Image>>,
) -> Res<()> {
    claude
        .send_with_images(&key, text, images.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn session_interrupt(claude: State<'_, Claude>, key: String) -> Res<()> {
    claude.interrupt(&key).await
}

#[tauri::command]
pub async fn session_set_effort(
    claude: State<'_, Claude>,
    key: String,
    effort: Option<String>,
) -> Res<()> {
    claude.set_effort(&key, effort).await
}

#[tauri::command]
pub async fn session_set_model(claude: State<'_, Claude>, key: String, model: String) -> Res<()> {
    claude.set_model(&key, model).await
}

#[tauri::command]
pub async fn session_set_permission_mode(
    claude: State<'_, Claude>,
    key: String,
    mode: PermissionMode,
) -> Res<()> {
    claude.set_permission_mode(&key, mode).await
}

#[tauri::command]
pub async fn session_models(claude: State<'_, Claude>, key: String) -> Res<Value> {
    claude.models(&key).await
}

#[tauri::command]
pub async fn permission_respond(
    claude: State<'_, Claude>,
    key: String,
    request_id: String,
    decision: String,
    message: Option<String>,
) -> Res<()> {
    claude
        .permission_respond(&key, request_id, decision, message)
        .await
}

#[tauri::command]
pub async fn session_close(claude: State<'_, Claude>, key: String) -> Res<()> {
    claude.close(&key).await
}

#[tauri::command]
pub fn sessions_list(claude: State<'_, Claude>) -> Res<Vec<SessionEntry>> {
    claude.sessions_list()
}

#[tauri::command]
pub fn session_history(claude: State<'_, Claude>, key: String) -> Res<Vec<Value>> {
    claude.history(&key)
}

#[tauri::command]
pub fn settings_get(claude: State<'_, Claude>) -> Res<Settings> {
    claude.settings_get()
}

#[tauri::command]
pub fn settings_set(claude: State<'_, Claude>, settings: Settings) -> Res<()> {
    claude.settings_set(&settings)
}

#[tauri::command]
pub fn usage_summary(claude: State<'_, Claude>, days: u32) -> Res<UsageSummary> {
    if !(1..=365).contains(&days) {
        return Err("Période invalide : 1 à 365 jours".into());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    // Unreadable journal: the session counts for 0.
    let sessions: Vec<_> = claude
        .sessions_list()?
        .iter()
        .map(|e| {
            let events = claude.history(&e.key).unwrap_or_default();
            (e.updated_at, usage::last_model_usage(&events))
        })
        .collect();
    Ok(usage::summarize(&sessions, now, days, usage::local_day))
}
