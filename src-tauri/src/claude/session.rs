//! Runs one bridge process per session (contracts/bridge-protocol.md) and owns the live sessions.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
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
/// Longest bridge line accepted; a longer one is skipped with a non-fatal `error`.
const MAX_LINE: usize = 16 * 1024 * 1024;

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
    /// Waiting `session_models` calls, by `requestId`.
    models: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    /// Held while writing a turn and applying its state, and while handling each bridge line,
    /// so a reply is never processed before the turn that caused it.
    turn: tokio::sync::Mutex<()>,
    kill: Mutex<Option<oneshot::Sender<()>>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

/// State managed by Tauri: the store and the live sessions.
pub struct Claude {
    store: Arc<Mutex<Store>>,
    sessions: Arc<Mutex<HashMap<String, Arc<Session>>>>,
    counter: AtomicU64,
    models_timeout: Duration,
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

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Looks `name` up in `PATH` (executable regular file).
/// The bridge bundled under `<resource_dir>/bridge/`, else (debug builds only) the repo's `bridge/`.
pub fn bridge_path(resource_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    if let Some(p) = resource_dir.map(|d| d.join("bridge/main.mjs"))
        && p.is_file()
    {
        return Ok(p);
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../bridge/main.mjs"));
        if dev.is_file() {
            return Ok(dev.to_path_buf());
        }
    }
    Err("Pont Claude introuvable : bridge/main.mjs absent des ressources de l'application".into())
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|d| d.join(name))
        .find(|p| is_executable(p))
}

/// `cwd` of `session_start`: `~` expanded, absolute, an existing folder, not `/`.
pub fn validate_cwd(cwd: &str) -> Result<String, String> {
    let expanded = match cwd.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => {
            let home = std::env::var("HOME").map_err(|_| "Dossier personnel inconnu ($HOME)")?;
            format!("{home}{rest}")
        }
        _ => cwd.to_string(),
    };
    let p = Path::new(&expanded);
    if !p.is_absolute() {
        return Err(format!("Chemin absolu requis : {cwd}"));
    }
    match p.canonicalize() {
        Ok(c) if c == Path::new("/") => {
            Err("La racine / ne peut pas servir de dossier de travail".into())
        }
        Ok(_) if p.is_dir() => Ok(expanded),
        _ => Err(format!("Dossier introuvable : {expanded}")),
    }
}

/// `claudePath` of `settings_set`: none, or an absolute path to an executable file.
pub fn validate_claude_path(settings: &Settings) -> Result<(), String> {
    match &settings.claude_path {
        Some(p) if !Path::new(p).is_absolute() => Err(format!(
            "Chemin de Claude Code : chemin absolu requis ({p})"
        )),
        Some(p) if !is_executable(Path::new(p)) => Err(format!(
            "Chemin de Claude Code : {p} n'est pas un fichier exécutable"
        )),
        _ => Ok(()),
    }
}

/// Next line of `r`, without its `\n`. `Ok(Some(None))`: a line longer than `max`, skipped.
async fn read_line<R: AsyncBufRead + Unpin>(
    r: &mut R,
    max: usize,
) -> std::io::Result<Option<Option<String>>> {
    let mut buf = Vec::new();
    let n = (&mut *r)
        .take(max as u64 + 1)
        .read_until(b'\n', &mut buf)
        .await?;
    if n == 0 {
        return Ok(None);
    }
    if buf.last() == Some(&b'\n') {
        buf.pop();
    } else if n > max {
        // Drop the rest of the oversized line, a bounded chunk at a time.
        loop {
            buf.clear();
            let n = (&mut *r)
                .take(max as u64)
                .read_until(b'\n', &mut buf)
                .await?;
            if n == 0 || buf.last() == Some(&b'\n') {
                return Ok(Some(None));
            }
        }
    }
    Ok(Some(Some(String::from_utf8_lossy(&buf).into_owned())))
}

/// Removes `key` from the live sessions if it is still `session` (a resume may reuse the key).
fn forget(sessions: &Mutex<HashMap<String, Arc<Session>>>, key: &str, session: &Arc<Session>) {
    if let Ok(mut all) = sessions.lock()
        && all.get(key).is_some_and(|s| Arc::ptr_eq(s, session))
    {
        all.remove(key);
    }
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
                if matches!(ev, SessionEvent::Sdk { message } if message["type"] == "stream_event")
                {
                    continue; // streaming fragments: emitted, not journaled (ipc.md §3)
                }
                match serde_json::to_value(ev) {
                    Ok(v) => {
                        if let Err(e) = store.append_event(&self.key, &v) {
                            eprintln!("[claude] journal {}: {e}", self.key);
                        }
                    }
                    Err(e) => eprintln!("[claude] serialize event: {e}"),
                }
            }
            if let Some(entry) = core.index_update()
                && let Err(e) = store.upsert_session(&entry)
            {
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

    /// `close` (unless already sent), up to `deadline` for the bridge to leave, then SIGKILL to
    /// its group. Bounded even if the bridge is frozen and the stdin write never completes.
    async fn shutdown(&self, deadline: tokio::time::Instant, send_close: bool) {
        if send_close {
            self.send_close(deadline).await;
        }
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

impl Session {
    async fn send_close(&self, deadline: tokio::time::Instant) {
        let _ = tokio::time::timeout_at(deadline, self.write(json!({"type": "close"}))).await;
    }
}

impl Claude {
    pub fn new(store: Store) -> Claude {
        Claude {
            store: Arc::new(Mutex::new(store)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            counter: AtomicU64::new(0),
            models_timeout: MODELS_TIMEOUT,
        }
    }

    /// Shorter `session_models` timeout, for tests.
    #[doc(hidden)]
    pub fn set_models_timeout(&mut self, timeout: Duration) {
        self.models_timeout = timeout;
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

    /// Starts a session on the bridge of `bridge_path(None)` (the repo's, debug builds only).
    pub async fn start(&self, args: StartArgs, sink: Sink) -> Result<String, String> {
        self.start_with_bridge(args, &bridge_path(None)?, sink)
            .await
    }

    /// `start` with a given bridge script, run by `node` (the app passes the bundled one).
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
        let cwd = validate_cwd(&args.cwd)?;

        let now = now_ms();
        // Resume of an indexed session: same key, same journal, same index line (ipc.md §3).
        let resumed = match &args.resume {
            Some(id) => self
                .sessions_list()?
                .into_iter()
                .find(|e| e.claude_session_id.as_deref() == Some(id.as_str())),
            None => None,
        };
        let is_resumed = resumed.is_some();
        let entry = resumed.unwrap_or_else(|| SessionEntry {
            key: format!("s-{now}-{}", self.counter.fetch_add(1, Ordering::Relaxed)),
            claude_session_id: None,
            cwd: cwd.clone(),
            title: String::new(),
            model: args.model.clone(),
            created_at: now,
            updated_at: now,
            cost_usd: 0.0,
        });
        let key = entry.key.clone();
        if self.get(&key).is_ok() {
            return Err("Cette session est déjà ouverte".into());
        }

        let mut cmd = Command::new(node);
        cmd.arg(bridge).current_dir(&cwd);
        let mut proc = supervisor::spawn(cmd)
            .map_err(|e| format!("Impossible de lancer le pont Claude : {e}"))?;

        push_recent_cwd(&mut settings.recent_cwds, &cwd);
        self.with_store(|s| s.save_settings(&settings))?;

        let (core, first) = Core::new(entry, is_resumed);
        let (kill_tx, mut kill_rx) = oneshot::channel();
        let session = Arc::new(Session {
            key: key.clone(),
            core: Mutex::new(core),
            sink,
            stdin: tokio::sync::Mutex::new(proc.stdin.take()),
            models: Mutex::new(HashMap::new()),
            turn: tokio::sync::Mutex::new(()),
            kill: Mutex::new(Some(kill_tx)),
            task: Mutex::new(None),
        });
        // Checked and registered under one lock (two resumes of one key may race), and before
        // the reader starts, so its cleanup cannot run first.
        let registered = self.sessions.lock().is_ok_and(|mut all| {
            !all.contains_key(&key) && all.insert(key.clone(), session.clone()).is_none()
        });
        if !registered {
            proc.kill();
            let _ = proc.wait().await;
            return Err("Cette session est déjà ouverte".into());
        }
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

        // stdout is drained by its own task: a line waiting for `turn` never blocks the bridge.
        let (line_tx, mut line_rx) = tokio::sync::mpsc::unbounded_channel();
        if let Some(stdout) = proc.stdout.take() {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout);
                while let Ok(Some(line)) = read_line(&mut reader, MAX_LINE).await {
                    if line_tx.send(line).is_err() {
                        break;
                    }
                }
            });
        }
        let (s, store, sessions) = (session.clone(), self.store.clone(), self.sessions.clone());
        let task = tokio::spawn(async move {
            let mut killed = false;
            loop {
                tokio::select! {
                    line = line_rx.recv() => match line {
                        // Waiting for `turn` must not stop a kill: `send` may hold it on a frozen bridge.
                        Some(Some(l)) => tokio::select! {
                            turn = s.turn.lock() => {
                                let _turn = turn;
                                handle_line(&s, &store, &l);
                            }
                            _ = &mut kill_rx, if !killed => {
                                killed = true;
                                proc.kill();
                            }
                        },
                        Some(None) => s.apply(&store, |_| vec![SessionEvent::Error {
                            message: "Message du pont trop long (plus de 16 Mo), ignoré".into(),
                            fatal: false,
                        }]),
                        None => break,
                    },
                    _ = &mut kill_rx, if !killed => {
                        killed = true;
                        proc.kill();
                    }
                }
            }
            // The bridge left: also take down whatever it left in its group (claude).
            proc.kill();
            let _ = proc.wait().await;
            // After any turn in flight (its writes now fail fast), so `exited` is the last state.
            let _turn = s.turn.lock().await;
            s.stdin.lock().await.take();
            if let Ok(mut m) = s.models.lock() {
                m.clear(); // pending `session_models` calls fail instead of hanging
            }
            // Nothing can use a dead bridge: free the session before announcing the end.
            forget(&sessions, &s.key, &s);
            s.apply(&store, |c| c.exited(now_ms()));
        });
        if let Ok(mut t) = session.task.lock() {
            *t = Some(task);
        }

        let mut start = json!({
            "type": "start",
            "cwd": cwd,
            "claudePath": claude,
            "permissionMode": mode_str(&args.permission_mode),
        });
        if let Some(m) = args.model {
            start["model"] = m.into();
        }
        if let Some(r) = args.resume {
            start["resume"] = r.into();
        }
        // The Obsidian vault is read-only ground for the bridge's no-popup Bash reads (bridge-protocol.md §2).
        if let Some(v) = settings
            .vault_path
            .as_deref()
            .filter(|v| Path::new(v).is_absolute() && Path::new(v).is_dir())
        {
            start["readRoots"] = json!([v]);
        }
        let written = {
            let _turn = session.turn.lock().await;
            let res = session.write(start).await;
            if res.is_ok() {
                session.apply(&self.store, |c| c.started(now_ms()));
            }
            res
        };
        if let Err(e) = written {
            // No key reaches the UI: nobody could close this bridge later.
            session
                .shutdown(tokio::time::Instant::now() + CLOSE_GRACE, false)
                .await;
            forget(&self.sessions, &key, &session);
            return Err(e);
        }
        Ok(key)
    }

    pub async fn send(&self, key: &str, text: String) -> Result<(), String> {
        let s = self.get(key)?;
        let _turn = s.turn.lock().await;
        s.write(json!({"type": "user", "text": text})).await?;
        s.apply(&self.store, |c| c.user(&text, now_ms()));
        Ok(())
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
        let id = format!("m-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        s.models
            .lock()
            .map_err(|_| "Session indisponible")?
            .insert(id.clone(), tx);
        let answer = match s
            .write(json!({"type": "list_models", "requestId": id}))
            .await
        {
            Ok(()) => tokio::time::timeout(self.models_timeout, rx).await.ok(),
            Err(_) => None,
        };
        match answer {
            Some(Ok(models)) => Ok(models),
            _ => {
                if let Ok(mut m) = s.models.lock() {
                    m.remove(&id); // a late reply is then ignored
                }
                Err("Liste des modèles indisponible".into())
            }
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
        let claimed = s.core.lock().map(|mut c| c.claim(&request_id));
        if !claimed.unwrap_or(false) {
            return Err("Demande de permission inconnue ou déjà traitée".into());
        }
        let mut msg =
            json!({"type": "permission_response", "requestId": request_id, "decision": decision});
        if let Some(m) = message {
            msg["message"] = m.into();
        }
        let _turn = s.turn.lock().await;
        if let Err(e) = s.write(msg).await {
            if let Ok(mut c) = s.core.lock() {
                c.unclaim(&request_id);
            }
            return Err(e);
        }
        s.apply(&self.store, |c| c.responded(&request_id, now_ms()));
        Ok(())
    }

    pub async fn close(&self, key: &str) -> Result<(), String> {
        let s = self.get(key)?;
        s.shutdown(tokio::time::Instant::now() + CLOSE_GRACE, true)
            .await;
        forget(&self.sessions, key, &s);
        Ok(())
    }

    /// Closes every session at once: one 2 s grace period in total, then SIGKILL.
    pub async fn close_all(&self) {
        let all: Vec<_> = match self.sessions.lock() {
            Ok(mut m) => m.drain().map(|(_, s)| s).collect(),
            Err(_) => return,
        };
        let deadline = tokio::time::Instant::now() + CLOSE_GRACE;
        for s in &all {
            s.send_close(deadline).await;
        }
        for s in &all {
            s.shutdown(deadline, false).await;
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
        validate_claude_path(settings)?;
        self.with_store(|s| s.save_settings(settings))
    }
}

fn handle_line(s: &Session, store: &Mutex<Store>, line: &str) {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return eprintln!("[claude] non-JSON bridge line ignored"),
    };
    if msg["type"] == "models" {
        let id = msg["requestId"].as_str().unwrap_or_default();
        let waiter = s.models.lock().ok().and_then(|mut m| m.remove(id));
        if let Some(tx) = waiter {
            let _ = tx.send(msg["models"].clone());
        }
        return;
    }
    s.apply(store, |c| c.bridge(msg, now_ms()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cwd_expands_home() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(validate_cwd("~").unwrap(), home);
        assert_eq!(validate_cwd("~/").unwrap(), format!("{home}/"));
        assert!(validate_cwd("~nobody").unwrap_err().contains("absolu"));
        assert!(validate_cwd("/.").unwrap_err().contains("racine"));
    }

    #[tokio::test]
    async fn long_lines_skipped() {
        let mut r: &[u8] = b"ok\n0123456789abc\nnext\nlast";
        let mut got = Vec::new();
        while let Some(l) = read_line(&mut r, 5).await.unwrap() {
            got.push(l);
        }
        assert_eq!(
            got,
            [
                Some("ok".into()),
                None,
                Some("next".into()),
                Some("last".into())
            ]
        );
    }

    #[test]
    fn bridge_path_prefers_resources_then_dev_bridge() {
        let res = std::env::temp_dir().join(format!("atelier-res-{}", std::process::id()));
        std::fs::create_dir_all(res.join("bridge")).unwrap();
        std::fs::write(res.join("bridge/main.mjs"), "").unwrap();
        assert_eq!(
            bridge_path(Some(res.clone())).unwrap(),
            res.join("bridge/main.mjs")
        );
        // Tests are debug builds: a missing resource falls back to the repo's bridge.
        let dev = bridge_path(Some(res.join("nope"))).unwrap();
        assert!(dev.ends_with("src-tauri/../bridge/main.mjs"));
        std::fs::remove_dir_all(res).unwrap();
    }
}
