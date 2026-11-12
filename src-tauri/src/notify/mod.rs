//! Desktop notifications (permission waiting, turn finished). Rust side only: the window
//! capability is untouched. `Tracker::on_event` is the pure decision; `on_event` shows it.

use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::claude::{Claude, SessionEvent, SessionState};

const MIN_GAP_MS: u64 = 5000;

#[derive(Debug, PartialEq)]
pub enum Note {
    /// Tool name of the pending permission request.
    Permission(String),
    Done,
}

/// Per-session memory: previous state, tool asked, last time each reason notified.
#[derive(Default)]
pub struct Tracker {
    state: Option<SessionState>,
    tool: String,
    last_permission: Option<u64>,
    last_done: Option<u64>,
}

fn due(last: &mut Option<u64>, now: u64) -> bool {
    let ok = last.is_none_or(|t| now.saturating_sub(t) >= MIN_GAP_MS);
    if ok {
        *last = Some(now);
    }
    ok
}

impl Tracker {
    pub fn on_event(&mut self, ev: &SessionEvent, focused: bool, now: u64) -> Option<Note> {
        match ev {
            SessionEvent::PermissionRequest { tool_name, .. } => {
                self.tool = tool_name.clone();
                None
            }
            SessionEvent::State { state, .. } => {
                let prev = self.state.replace(*state);
                if focused || prev == Some(*state) {
                    return None;
                }
                match (prev, state) {
                    (_, SessionState::WaitingPermission) => due(&mut self.last_permission, now)
                        .then(|| Note::Permission(self.tool.clone())),
                    (Some(SessionState::Running), SessionState::Idle) => {
                        due(&mut self.last_done, now).then_some(Note::Done)
                    }
                    _ => None,
                }
            }
            _ => None,
        }
    }
}

/// Sink hook: call for every event of one session. `key` is set once `session_start` returns.
pub fn on_event(
    app: &AppHandle,
    tracker: &Mutex<Tracker>,
    key: &OnceLock<String>,
    ev: &SessionEvent,
) {
    let focused = app
        .get_window("main") // not get_webview_window: with the Instagram panel, "main" holds two webviews
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default();
    let note = tracker
        .lock()
        .ok()
        .and_then(|mut t| t.on_event(ev, focused, now));
    let Some(note) = note else { return };
    let (title, body) = match note {
        Note::Permission(tool) => ("Claude attend ton accord".to_string(), tool),
        Note::Done => {
            let session_title = key
                .get()
                .and_then(|k| {
                    let list = app.state::<Claude>().sessions_list().ok()?;
                    list.into_iter().find(|e| &e.key == k).map(|e| e.title)
                })
                .unwrap_or_default();
            ("Claude a terminé".to_string(), session_title)
        }
    };
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("[notify] {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use SessionState::*;

    fn st(s: SessionState) -> SessionEvent {
        SessionEvent::State {
            state: s,
            error: None,
        }
    }

    fn ask(tool: &str) -> SessionEvent {
        serde_json::from_value(serde_json::json!({
            "kind": "permission_request", "requestId": "r", "toolName": tool,
            "input": {}, "toolUseID": "t", "canAlways": false
        }))
        .unwrap()
    }

    #[test]
    fn permission_and_done() {
        let mut t = Tracker::default();
        assert_eq!(t.on_event(&st(Running), false, 0), None);
        t.on_event(&ask("Bash"), false, 0);
        assert_eq!(
            t.on_event(&st(WaitingPermission), false, 0),
            Some(Note::Permission("Bash".into()))
        );
        t.on_event(&st(Running), false, 1);
        assert_eq!(t.on_event(&st(Idle), false, 2), Some(Note::Done));
    }

    #[test]
    fn silent_when_focused() {
        let mut t = Tracker::default();
        t.on_event(&st(Running), true, 0);
        assert_eq!(t.on_event(&st(Idle), true, 1), None);
    }

    #[test]
    fn rate_limited_per_reason() {
        let mut t = Tracker::default();
        let mut turn = |now| {
            t.on_event(&st(Running), false, now);
            t.on_event(&st(Idle), false, now)
        };
        assert_eq!(turn(0), Some(Note::Done));
        assert_eq!(turn(4999), None);
        assert_eq!(turn(5000), Some(Note::Done));
    }

    #[test]
    fn idle_without_running_is_silent() {
        let mut t = Tracker::default();
        assert_eq!(t.on_event(&st(Starting), false, 0), None);
        assert_eq!(t.on_event(&st(Idle), false, 1), None);
    }
}
