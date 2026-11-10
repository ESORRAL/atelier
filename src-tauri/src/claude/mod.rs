//! Module `claude`: see contracts/ipc.md §3-4 and contracts/bridge-protocol.md.
//! `Core` is the pure part (bridge message -> `SessionEvent`, state, index entry); `session`
//! runs the bridge process; `commands` exposes the Tauri commands of ipc.md §1.

pub mod commands;
mod session;

pub use session::{Claude, Sink, StartArgs, bridge_path};

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::store::SessionEntry;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Starting,
    Idle,
    Running,
    WaitingPermission,
    Closed,
    Crashed,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SessionEvent {
    Sdk {
        message: Value,
    },
    PermissionRequest {
        request_id: String,
        tool_name: String,
        input: Value,
        #[serde(rename = "toolUseID")]
        tool_use_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        display_name: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        blocked_path: Option<String>,
        can_always: bool,
    },
    PermissionCancelled {
        request_id: String,
    },
    User {
        text: String,
    },
    State {
        state: SessionState,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Error {
        message: String,
        fatal: bool,
    },
}

const TITLE_CHARS: usize = 60;
const RECENT_CWDS: usize = 10;

/// Puts `cwd` first in `recent`, without duplicate, 10 at most.
pub fn push_recent_cwd(recent: &mut Vec<String>, cwd: &str) {
    recent.retain(|c| c != cwd);
    recent.insert(0, cwd.to_string());
    recent.truncate(RECENT_CWDS);
}

/// Pure state of one session. Every method returns the events to journal then emit, in order;
/// `entry` is the index entry, up to date after each call.
pub struct Core {
    pub entry: SessionEntry,
    pub state: SessionState,
    pending: BTreeSet<String>,
}

impl Core {
    pub fn new(entry: SessionEntry) -> (Core, Vec<SessionEvent>) {
        let core = Core {
            entry,
            state: SessionState::Starting,
            pending: BTreeSet::new(),
        };
        (core, vec![state_event(SessionState::Starting, None)])
    }

    fn set_state(&mut self, state: SessionState, out: &mut Vec<SessionEvent>) {
        if self.state != state {
            self.state = state;
            out.push(state_event(state, None));
        }
    }

    fn touch(&mut self, now: u64, out: &[SessionEvent]) {
        if !out.is_empty() {
            self.entry.updated_at = now;
        }
    }

    /// One line from the bridge, already parsed. `models` is answered by the caller, not here.
    pub fn bridge(&mut self, mut msg: Value, now: u64) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        let kind = msg["type"].as_str().unwrap_or_default().to_string();
        match kind.as_str() {
            "sdk" => {
                let m = msg["message"].take();
                match (m["type"].as_str(), m["subtype"].as_str()) {
                    (Some("system"), Some("init")) => {
                        if let Some(id) = m["session_id"].as_str() {
                            self.entry.claude_session_id = Some(id.into());
                        }
                        if let Some(model) = m["model"].as_str() {
                            self.entry.model = Some(model.into());
                        }
                        out.push(SessionEvent::Sdk { message: m });
                        self.set_state(SessionState::Running, &mut out);
                    }
                    (Some("result"), _) => {
                        if let Some(cost) = m["total_cost_usd"].as_f64() {
                            self.entry.cost_usd = cost; // cumulative: replace
                        }
                        out.push(SessionEvent::Sdk { message: m });
                        if self.pending.is_empty() {
                            self.set_state(SessionState::Idle, &mut out);
                        }
                    }
                    _ => out.push(SessionEvent::Sdk { message: m }),
                }
            }
            "permission_request" | "permission_cancelled" | "error" => {
                // Same fields as the SessionEvent variant: only the tag name differs.
                if let Some(obj) = msg.as_object_mut() {
                    obj.remove("type");
                    obj.insert("kind".into(), kind.clone().into());
                }
                match serde_json::from_value::<SessionEvent>(msg) {
                    Ok(ev) => {
                        out.push(ev.clone());
                        match ev {
                            SessionEvent::PermissionRequest { request_id, .. } => {
                                self.pending.insert(request_id);
                                self.set_state(SessionState::WaitingPermission, &mut out);
                            }
                            SessionEvent::PermissionCancelled { request_id } => {
                                self.settled(&request_id, &mut out)
                            }
                            _ => {}
                        }
                    }
                    Err(e) => eprintln!("[claude] malformed bridge `{kind}`: {e}"),
                }
            }
            "closed" => self.set_state(SessionState::Closed, &mut out),
            "ready" => {}
            other => eprintln!("[claude] unknown bridge message ignored: {other}"),
        }
        self.touch(now, &out);
        out
    }

    fn settled(&mut self, request_id: &str, out: &mut Vec<SessionEvent>) {
        self.pending.remove(request_id);
        if self.pending.is_empty() && self.state == SessionState::WaitingPermission {
            self.set_state(SessionState::Running, out);
        }
    }

    /// A turn sent by `session_send`, before it is written to the bridge.
    pub fn user(&mut self, text: &str, now: u64) -> Vec<SessionEvent> {
        if self.entry.title.is_empty() {
            self.entry.title = text.chars().take(TITLE_CHARS).collect();
        }
        let out = vec![SessionEvent::User { text: text.into() }];
        self.touch(now, &out);
        out
    }

    /// A `permission_response` was written to the bridge.
    pub fn responded(&mut self, request_id: &str, now: u64) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        self.settled(request_id, &mut out);
        self.touch(now, &out);
        out
    }

    /// Takes a pending request before its response is written, so it is answered only once.
    /// `responded` then applies the state change.
    pub fn claim(&mut self, request_id: &str) -> bool {
        self.pending.remove(request_id)
    }

    /// The bridge process is gone.
    pub fn exited(&mut self, now: u64) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        if self.state != SessionState::Closed {
            for request_id in std::mem::take(&mut self.pending) {
                out.push(SessionEvent::PermissionCancelled { request_id });
            }
            self.state = SessionState::Crashed;
            out.push(state_event(
                SessionState::Crashed,
                Some("Le pont Claude s'est arrêté de façon inattendue".into()),
            ));
        }
        self.touch(now, &out);
        out
    }
}

fn state_event(state: SessionState, error: Option<String>) -> SessionEvent {
    SessionEvent::State { state, error }
}

#[cfg(test)]
mod tests {
    use super::*;
    use SessionState::*;
    use serde_json::json;

    fn core() -> Core {
        let entry = SessionEntry {
            key: "s-1-0".into(),
            claude_session_id: None,
            cwd: "/tmp".into(),
            title: String::new(),
            model: None,
            created_at: 1,
            updated_at: 1,
            cost_usd: 0.0,
        };
        let (c, ev) = Core::new(entry);
        assert_eq!(ev, vec![state_event(Starting, None)]);
        c
    }

    fn sdk(m: Value) -> Value {
        json!({"type": "sdk", "message": m})
    }
    fn init() -> Value {
        sdk(json!({"type": "system", "subtype": "init", "session_id": "abc", "model": "haiku"}))
    }
    fn result(cost: f64) -> Value {
        sdk(json!({"type": "result", "subtype": "success", "total_cost_usd": cost}))
    }
    fn perm(id: &str) -> Value {
        json!({"type": "permission_request", "requestId": id, "toolName": "Bash",
               "input": {"command": "ls"}, "toolUseID": "tu", "canAlways": true})
    }
    fn states(ev: &[SessionEvent]) -> Vec<SessionState> {
        ev.iter()
            .filter_map(|e| match e {
                SessionEvent::State { state, .. } => Some(*state),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn init_runs_and_fills_index() {
        let mut c = core();
        let ev = c.bridge(init(), 5);
        assert!(matches!(ev[0], SessionEvent::Sdk { .. }));
        assert_eq!(states(&ev), [Running]);
        assert_eq!(c.entry.claude_session_id.as_deref(), Some("abc"));
        assert_eq!(c.entry.model.as_deref(), Some("haiku"));
        assert_eq!(c.entry.updated_at, 5);
    }

    #[test]
    fn result_idles_and_replaces_cost() {
        let mut c = core();
        c.bridge(init(), 2);
        assert_eq!(states(&c.bridge(result(0.25), 3)), [Idle]);
        c.bridge(init(), 4);
        c.bridge(result(0.75), 5);
        assert_eq!(c.entry.cost_usd, 0.75);
    }

    #[test]
    fn permission_cycle() {
        let mut c = core();
        c.bridge(init(), 2);
        let ev = c.bridge(perm("r1"), 3);
        assert!(
            matches!(&ev[0], SessionEvent::PermissionRequest { request_id, tool_use_id, .. }
            if request_id == "r1" && tool_use_id == "tu")
        );
        assert_eq!(states(&ev), [WaitingPermission]);
        c.bridge(perm("r2"), 4);
        // result while a request is still pending: stays waiting.
        assert_eq!(states(&c.bridge(result(0.1), 5)), []);
        assert_eq!(states(&c.responded("r1", 6)), []);
        let ev = c.bridge(
            json!({"type": "permission_cancelled", "requestId": "r2"}),
            7,
        );
        assert_eq!(
            ev[0],
            SessionEvent::PermissionCancelled {
                request_id: "r2".into()
            }
        );
        assert_eq!(states(&ev), [Running]);
    }

    #[test]
    fn response_with_none_left_runs() {
        let mut c = core();
        c.bridge(perm("r1"), 2);
        assert!(c.claim("r1"));
        assert!(!c.claim("r1"));
        assert_eq!(states(&c.responded("r1", 3)), [Running]);
    }

    #[test]
    fn closed_then_exit_is_clean() {
        let mut c = core();
        assert_eq!(states(&c.bridge(json!({"type": "closed"}), 2)), [Closed]);
        assert!(c.exited(3).is_empty());
    }

    #[test]
    fn exit_without_closed_crashes_and_cancels() {
        let mut c = core();
        c.bridge(perm("r1"), 2);
        let ev = c.exited(3);
        assert_eq!(
            ev[0],
            SessionEvent::PermissionCancelled {
                request_id: "r1".into()
            }
        );
        assert!(matches!(
            &ev[1],
            SessionEvent::State {
                state: Crashed,
                error: Some(_)
            }
        ));
        assert!(!c.claim("r1"));
    }

    #[test]
    fn error_passes_through_and_ready_or_unknown_ignored() {
        let mut c = core();
        let ev = c.bridge(json!({"type": "error", "message": "x", "fatal": false}), 2);
        assert_eq!(
            ev,
            vec![SessionEvent::Error {
                message: "x".into(),
                fatal: false
            }]
        );
        assert!(
            c.bridge(json!({"type": "ready", "sdkVersion": "1"}), 3)
                .is_empty()
        );
        assert!(c.bridge(json!({"type": "nope"}), 4).is_empty());
        assert_eq!(c.entry.updated_at, 2);
    }

    #[test]
    fn title_is_first_user_message_60_chars() {
        let mut c = core();
        let long = "é".repeat(70);
        assert_eq!(
            c.user(&long, 9),
            vec![SessionEvent::User { text: long.clone() }]
        );
        assert_eq!(c.entry.title, "é".repeat(60));
        c.user("second", 10);
        assert_eq!(c.entry.title, "é".repeat(60));
        assert_eq!(c.entry.updated_at, 10);
    }

    #[test]
    fn recent_cwds_dedup_and_cap() {
        let mut r: Vec<String> = (0..10).map(|i| format!("/d{i}")).collect();
        push_recent_cwd(&mut r, "/d5");
        assert_eq!(r[0], "/d5");
        assert_eq!(r.len(), 10);
        push_recent_cwd(&mut r, "/new");
        assert_eq!(r[0], "/new");
        assert_eq!(r.len(), 10);
        assert!(!r.contains(&"/d9".to_string()));
    }

    #[test]
    fn events_serialize_per_contract() {
        let ev = SessionEvent::State {
            state: WaitingPermission,
            error: None,
        };
        assert_eq!(
            serde_json::to_value(ev).unwrap(),
            json!({"kind": "state", "state": "waiting_permission"})
        );
        let mut c = core();
        let ev = c.bridge(perm("r1"), 2).remove(0);
        assert_eq!(
            serde_json::to_value(ev).unwrap(),
            json!({"kind": "permission_request", "requestId": "r1", "toolName": "Bash",
                   "input": {"command": "ls"}, "toolUseID": "tu", "canAlways": true})
        );
    }
}
