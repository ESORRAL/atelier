//! Tauri commands of contracts/ipc.md §1.

use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use super::{Claude, SessionEvent, StartArgs, bridge_path};
use crate::store::{PermissionMode, SessionEntry, Settings};

type Res<T> = Result<T, String>;

#[tauri::command]
pub async fn session_start(
    app: AppHandle,
    claude: State<'_, Claude>,
    cwd: String,
    model: Option<String>,
    permission_mode: PermissionMode,
    resume: Option<String>,
    on_event: Channel<SessionEvent>,
) -> Res<String> {
    let sink = Arc::new(move |ev: SessionEvent| {
        if let Err(e) = on_event.send(ev) {
            eprintln!("[claude] channel: {e}");
        }
    });
    let args = StartArgs {
        cwd,
        model,
        permission_mode,
        resume,
    };
    let bridge = bridge_path(app.path().resource_dir().ok())?;
    eprintln!("[claude] bridge: {}", bridge.display());
    claude.start_with_bridge(args, &bridge, sink).await
}

#[tauri::command]
pub async fn session_send(claude: State<'_, Claude>, key: String, text: String) -> Res<()> {
    claude.send(&key, text).await
}

#[tauri::command]
pub async fn session_interrupt(claude: State<'_, Claude>, key: String) -> Res<()> {
    claude.interrupt(&key).await
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
