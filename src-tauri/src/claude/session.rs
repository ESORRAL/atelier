//! Runs one bridge process per session (contracts/bridge-protocol.md) and owns the live sessions.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use super::{Core, SessionEvent, push_recent_cwd};
use crate::store::{PermissionMode, SessionEntry, Settings, Store};
use crate::supervisor;

/// Where every `SessionEvent` of a session goes once journaled (the Tauri `Channel` in the app).
pub type Sink = Arc<dyn Fn(SessionEvent) + Send + Sync>;

const CLOSE_GRACE: Duration = Duration::from_secs(2);
const MODELS_TIMEOUT: Duration = Duration::from_secs(15);

pub struct StartArgs {
    pub cwd: String,
    pub model: Option<String>,
    pub permission_mode: PermissionMode,
    pub resume: Option<String>,
}

struct Session {
    key: String,
    core: Mutex<Core>,
    sink: Sink,
    stdin: tokio::sync::Mutex<Option<ChildStdin>>,
    models: Mutex<VecDeque<oneshot::Sender<Value>>>,
    kill: Mutex<Option<oneshot::Sender<()>>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

/// State managed by Tauri: the store and the live sessions.
pub struct Claude {
    store: Arc<Mutex<Store>>,
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    counter: AtomicU64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn io_err(e: std::io::Error) -> String {
    format!("Erreur de stockage : {e}")
}

/// Looks `name` up in `PATH` (executable regular file).
fn find_in_path(name: &str) -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|d| d.join(name))
        .find(|p| {
            p.metadata()
                .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
        })
}

fn claude_path(settings: &Settings) -> Result<PathBuf, String> {
    match &settings.claude_path {
        Some(p) if Path::new(p).is_file() => Ok(p.into()),
        Some(p) => Err(format!("Claude Code introuvable : {p} n'existe pas")),
        None => find_in_path("claude")
            .ok_or_else(|| "Claude Code introuvable : `claude` absent du PATH".to_string()),
    }
}

fn mode_str(m: &PermissionMode) -> Value {
    serde_json::to_value(m).unwrap_or(Value::Null)
}

impl Session {
    /// Journals then emits each event, and saves the index entry. Holds `core` while doing so,
    /// so the journal order is the emission order.
    fn apply(&self, store: &Mutex<Store>, f: impl FnOnce(&mut Core) -> Vec<SessionEvent>) {
        let Ok(mut core) = self.core.lock() else {
            return;
        };
        let events = f(&mut core);
        if events.is_empty() {
            return;
        }
        if let Ok(store) = store.lock() {
            for ev in &events {
                match serde_json::to_value(ev) {
                    Ok(v) => {
                        if let Err(e) = store.append_event(&self.key, &v) {
                            eprintln!("[claude] journal {}: {e}", self.key);
                        }
                    }
                    Err(e) => eprintln!("[claude] serialize event: {e}"),
                }
            }
            if let Err(e) = store.upsert_session(&core.entry) {
                eprintln!("[claude] index {}: {e}", self.key);
            }
        }
        for ev in events {
            (self.sink)(ev);
        }
    }

    async fn write(&self, msg: Value) -> Result<(), String> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard.as_mut().ok_or("Le pont Claude est arrêté")?;
        let mut line = msg.to_string();
        line.push('\n');
        let res = async {
            stdin.write_all(line.as_bytes()).await?;
            stdin.flush().await
        }
        .await;
        res.map_err(|e| format!("Le pont Claude ne répond plus : {e}"))
    }

    /// `close`, up to `deadline` for the bridge to leave, then SIGKILL to its group.
    async fn shutdown(&self, deadline: tokio::time::Instant) {
        let _ = self.write(json!({"type": "close"})).await;
        let handle = self.task.lock().ok().and_then(|mut t| t.take());
        let Some(mut handle) = handle else { return };
        if tokio::time::timeout_at(deadline, &mut handle)
            .await
            .is_err()
        {
            if let Some(kill) = self.kill.lock().ok().and_then(|mut k| k.take()) {
                let _ = kill.send(());
            }
            let _ = handle.await;
        }
    }
}

impl Claude {
    pub fn new(store: Store) -> Claude {
        Claude {
            store: Arc::new(Mutex::new(store)),
            sessions: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
        }
    }

    fn with_store<T>(&self, f: impl FnOnce(&Store) -> std::io::Result<T>) -> Result<T, String> {
        let store = self.store.lock().map_err(|_| "Stockage indisponible")?;
        f(&store).map_err(io_err)
    }

    fn get(&self, key: &str) -> Result<Arc<Session>, String> {
        self.sessions
            .lock()
            .ok()
            .and_then(|s| s.get(key).cloned())
            .ok_or_else(|| "Session inconnue".to_string())
    }

    /// Starts a session on the development bridge.
    pub async fn start(&self, args: StartArgs, sink: Sink) -> Result<String, String> {
        // shortcut: dev location of the bridge only; the installed path is decided with the .deb (phase 3).
        let bridge = concat!(env!("CARGO_MANIFEST_DIR"), "/../bridge/main.mjs");
        self.start_with_bridge(args, Path::new(bridge), sink).await
    }

    /// `start` with another bridge script, run by `node` the same way (tests use a fake bridge).
    #[doc(hidden)]
    pub async fn start_with_bridge(
        &self,
        args: StartArgs,
        bridge: &Path,
        sink: Sink,
    ) -> Result<String, String> {
        let mut settings = self.with_store(|s| s.load_settings())?;
        let claude = claude_path(&settings)?;
        let node = find_in_path("node")
            .ok_or("Node.js introuvable : `node` absent du PATH (requis par le pont Claude)")?;
        if !Path::new(&args.cwd).is_dir() {
            return Err(format!("Dossier introuvable : {}", args.cwd));
        }

        let now = now_ms();
        let key = format!("s-{now}-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let mut cmd = Command::new(node);
        cmd.arg(bridge).current_dir(&args.cwd);
        let mut proc = supervisor::spawn(cmd)
            .map_err(|e| format!("Impossible de lancer le pont Claude : {e}"))?;

        push_recent_cwd(&mut settings.recent_cwds, &args.cwd);
        self.with_store(|s| s.save_settings(&settings))?;

        let (core, first) = Core::new(SessionEntry {
            key: key.clone(),
            claude_session_id: None,
            cwd: args.cwd.clone(),
            title: String::new(),
            model: args.model.clone(),
            created_at: now,
            updated_at: now,
            cost_usd: 0.0,
        });
        let (kill_tx, mut kill_rx) = oneshot::channel();
        let session = Arc::new(Session {
            key: key.clone(),
            core: Mutex::new(core),
            sink,
            stdin: tokio::sync::Mutex::new(proc.stdin.take()),
            models: Mutex::new(VecDeque::new()),
            kill: Mutex::new(Some(kill_tx)),
            task: Mutex::new(None),
        });
        session.apply(&self.store, |_| first);

        if let Some(stderr) = proc.stderr.take() {
            let key = key.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(l)) = lines.next_line().await {
                    eprintln!("[bridge {key}] {l}");
                }
            });
        }

        let stdout = proc.stdout.take();
        let (s, store) = (session.clone(), self.store.clone());
        let task = tokio::spawn(async move {
            if let Some(stdout) = stdout {
                let mut lines = BufReader::new(stdout).lines();
                let mut killed = false;
                loop {
                    tokio::select! {
                        line = lines.next_line() => match line {
                            Ok(Some(l)) => handle_line(&s, &store, &l),
                            _ => break,
                        },
                        _ = &mut kill_rx, if !killed => {
                            killed = true;
                            proc.kill();
                        }
                    }
                }
            }
            // The bridge left: also take down whatever it left in its group (claude).
            proc.kill();
            let _ = proc.wait().await;
            s.stdin.lock().await.take();
            if let Ok(mut m) = s.models.lock() {
                m.clear(); // pending `session_models` calls fail instead of hanging
            }
            s.apply(&store, |c| c.exited(now_ms()));
        });
        if let Ok(mut t) = session.task.lock() {
            *t = Some(task);
        }
        if let Ok(mut all) = self.sessions.lock() {
            all.insert(key.clone(), session.clone());
        }

        let mut start = json!({
            "type": "start",
            "cwd": args.cwd,
            "claudePath": claude,
            "permissionMode": mode_str(&args.permission_mode),
        });
        if let Some(m) = args.model {
            start["model"] = m.into();
        }
        if let Some(r) = args.resume {
            start["resume"] = r.into();
        }
        session.write(start).await?;
        Ok(key)
    }

    pub async fn send(&self, key: &str, text: String) -> Result<(), String> {
        let s = self.get(key)?;
        s.apply(&self.store, |c| c.user(&text, now_ms()));
        s.write(json!({"type": "user", "text": text})).await
    }

    pub async fn interrupt(&self, key: &str) -> Result<(), String> {
        self.get(key)?.write(json!({"type": "interrupt"})).await
    }

    pub async fn set_model(&self, key: &str, model: String) -> Result<(), String> {
        let s = self.get(key)?;
        s.write(json!({"type": "set_model", "model": model})).await
    }

    pub async fn set_permission_mode(&self, key: &str, mode: PermissionMode) -> Result<(), String> {
        let s = self.get(key)?;
        s.write(json!({"type": "set_permission_mode", "mode": mode_str(&mode)}))
            .await
    }

    pub async fn models(&self, key: &str) -> Result<Value, String> {
        let s = self.get(key)?;
        let (tx, rx) = oneshot::channel();
        s.models
            .lock()
            .map_err(|_| "Session indisponible")?
            .push_back(tx);
        s.write(json!({"type": "list_models"})).await?;
        match tokio::time::timeout(MODELS_TIMEOUT, rx).await {
            Ok(Ok(models)) => Ok(models),
            _ => Err("Liste des modèles indisponible".into()),
        }
    }

    pub async fn permission_respond(
        &self,
        key: &str,
        request_id: String,
        decision: String,
        message: Option<String>,
    ) -> Result<(), String> {
        let s = self.get(key)?;
        if !matches!(decision.as_str(), "allow_once" | "allow_always" | "deny") {
            return Err(format!("Décision invalide : {decision}"));
        }
        let pending = s.core.lock().map(|c| c.is_pending(&request_id));
        if !pending.unwrap_or(false) {
            return Err("Demande de permission inconnue ou déjà traitée".into());
        }
        let mut msg =
            json!({"type": "permission_response", "requestId": request_id, "decision": decision});
        if let Some(m) = message {
            msg["message"] = m.into();
        }
        s.write(msg).await?;
        s.apply(&self.store, |c| c.responded(&request_id, now_ms()));
        Ok(())
    }

    pub async fn close(&self, key: &str) -> Result<(), String> {
        let s = self.get(key)?;
        s.shutdown(tokio::time::Instant::now() + CLOSE_GRACE).await;
        if let Ok(mut all) = self.sessions.lock() {
            all.remove(key);
        }
        Ok(())
    }

    /// Closes every session at once: one 2 s grace period in total, then SIGKILL.
    pub async fn close_all(&self) {
        let all: Vec<_> = match self.sessions.lock() {
            Ok(mut m) => m.drain().map(|(_, s)| s).collect(),
            Err(_) => return,
        };
        for s in &all {
            let _ = s.write(json!({"type": "close"})).await;
        }
        let deadline = tokio::time::Instant::now() + CLOSE_GRACE;
        for s in &all {
            s.shutdown(deadline).await;
        }
    }

    pub fn sessions_list(&self) -> Result<Vec<SessionEntry>, String> {
        self.with_store(|s| s.list_sessions())
    }

    pub fn history(&self, key: &str) -> Result<Vec<Value>, String> {
        let known = self.sessions_list()?.iter().any(|e| e.key == key);
        if !known {
            return Err("Session inconnue".into());
        }
        self.with_store(|s| s.read_events(key))
    }

    pub fn settings_get(&self) -> Result<Settings, String> {
        self.with_store(|s| s.load_settings())
    }

    pub fn settings_set(&self, settings: &Settings) -> Result<(), String> {
        self.with_store(|s| s.save_settings(settings))
    }
}

fn handle_line(s: &Session, store: &Mutex<Store>, line: &str) {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return eprintln!("[claude] non-JSON bridge line ignored"),
    };
    if msg["type"] == "models" {
        let waiter = s.models.lock().ok().and_then(|mut m| m.pop_front());
        if let Some(tx) = waiter {
            let _ = tx.send(msg["models"].clone());
        }
        return;
    }
    s.apply(store, |c| c.bridge(msg, now_ms()));
}
