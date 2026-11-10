//! Integration tests for `claude`: the real launcher, store and supervisor, driving a fake bridge
//! (tests/fake-bridge.mjs) run by `node`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Once};
use std::time::{Duration, Instant};

use atelier_lib::claude::{Claude, SessionEvent, SessionState, Sink, StartArgs};
use atelier_lib::store::{PermissionMode, Settings, Store};
use serde_json::{Value, json};
use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};

fn init() {
    static ONCE: Once = Once::new();
    // The test harness cannot run in watchdog mode: point the watchdog at the app binary.
    ONCE.call_once(|| unsafe {
        std::env::set_var("ATELIER_WATCHDOG_EXE", env!("CARGO_BIN_EXE_atelier"))
    });
}

fn temp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("atelier-claude-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// A `Claude` on a fresh store whose `claudePath` exists (the fake bridge never runs it).
fn claude(name: &str) -> (Claude, PathBuf) {
    init();
    let base = temp_dir(name);
    let store = Store::open(base.join("data")).unwrap();
    store
        .save_settings(&Settings {
            claude_path: Some("/bin/sh".into()),
            ..Settings::default()
        })
        .unwrap();
    let cwd = base.join("work");
    std::fs::create_dir_all(&cwd).unwrap();
    (Claude::new(store), cwd)
}

fn sink() -> (Sink, UnboundedReceiver<SessionEvent>) {
    let (tx, rx) = unbounded_channel();
    (
        Arc::new(move |e| {
            let _ = tx.send(e);
        }),
        rx,
    )
}

fn fake_bridge() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fake-bridge.mjs")
}

fn args(cwd: &Path) -> StartArgs {
    StartArgs {
        cwd: cwd.to_str().unwrap().into(),
        model: None,
        permission_mode: PermissionMode::Default,
        resume: None,
    }
}

/// Collects events until one matches `stop`; returns them all, the matching one last.
async fn until(
    rx: &mut UnboundedReceiver<SessionEvent>,
    stop: impl Fn(&SessionEvent) -> bool,
) -> Vec<SessionEvent> {
    let mut seen = Vec::new();
    loop {
        let ev = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .unwrap_or_else(|_| panic!("timed out, seen: {seen:?}"))
            .expect("channel closed");
        let done = stop(&ev);
        seen.push(ev);
        if done {
            return seen;
        }
    }
}

fn is_state(s: SessionState) -> impl Fn(&SessionEvent) -> bool {
    move |e| matches!(e, SessionEvent::State { state, .. } if *state == s)
}

/// Pids the fake bridge reports in its `init`: itself and its `sleep` grandchild.
fn pids(events: &[SessionEvent]) -> Vec<i32> {
    events
        .iter()
        .find_map(|e| match e {
            SessionEvent::Sdk { message } if message["subtype"] == "init" => {
                serde_json::from_value(message["pids"].clone()).ok()
            }
            _ => None,
        })
        .expect("no init")
}

fn alive(pid: i32) -> bool {
    std::fs::read_to_string(format!("/proc/{pid}/stat"))
        .map(|s| {
            !s.rsplit(')')
                .next()
                .unwrap_or("")
                .trim_start()
                .starts_with('Z')
        })
        .unwrap_or(false)
}

fn assert_gone(pids: &[i32]) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while pids.iter().any(|p| alive(*p)) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    let left: Vec<_> = pids.iter().filter(|p| alive(**p)).collect();
    assert!(left.is_empty(), "processes left: {left:?}");
}

#[tokio::test]
async fn full_session_with_fake_bridge() {
    let (c, cwd) = claude("full");
    let (sink, mut rx) = sink();
    let key = c
        .start_with_bridge(args(&cwd), &fake_bridge(), sink)
        .await
        .unwrap();
    assert!(key.starts_with("s-"));
    // Idle as soon as `start` is written, without waiting for the first `init`.
    let mut all = until(&mut rx, is_state(SessionState::Idle)).await;
    assert!(
        c.sessions_list().unwrap().is_empty(),
        "no entry before a turn"
    );

    c.send(&key, "bonjour".into()).await.unwrap();
    all.extend(until(&mut rx, is_state(SessionState::Idle)).await);
    let pids = pids(&all);

    c.send(&key, "perm".into()).await.unwrap();
    let ev = until(&mut rx, is_state(SessionState::WaitingPermission)).await;
    all.extend(ev.iter().cloned());
    let Some(SessionEvent::PermissionRequest { request_id, .. }) = ev
        .iter()
        .find(|e| matches!(e, SessionEvent::PermissionRequest { .. }))
    else {
        panic!("no permission request: {ev:?}")
    };
    c.permission_respond(&key, request_id.clone(), "allow_once".into(), None)
        .await
        .unwrap();
    let ev = until(&mut rx, is_state(SessionState::Idle)).await;
    all.extend(ev.iter().cloned());
    assert!(ev.contains(&SessionEvent::State {
        state: SessionState::Running,
        error: None
    }));
    let reply = ev.iter().find_map(|e| match e {
        SessionEvent::Sdk { message } if message["type"] == "assistant" => {
            message["message"]["content"][0]["text"].as_str()
        }
        _ => None,
    });
    assert_eq!(reply, Some("perm allow_once"));

    let models = c.models(&key).await.unwrap();
    assert_eq!(models[0]["value"], "haiku");

    c.close(&key).await.unwrap();
    assert_gone(&pids);
    assert!(
        c.send(&key, "x".into())
            .await
            .unwrap_err()
            .contains("inconnue")
    );

    // Index: id, model, cost replaced (0.02 is turn 2's cumulative cost), title.
    let list = c.sessions_list().unwrap();
    let e = list.iter().find(|e| e.key == key).unwrap();
    assert_eq!(e.claude_session_id.as_deref(), Some("fake-sess"));
    assert_eq!(e.model.as_deref(), Some("fake-model"));
    assert_eq!(e.title, "bonjour");
    assert!((e.cost_usd - 0.02).abs() < 1e-9, "{}", e.cost_usd);
    assert_eq!(
        c.settings_get().unwrap().recent_cwds,
        [cwd.to_str().unwrap()]
    );

    // Journal, replayed in order: exactly what was emitted, minus the streaming fragments.
    while let Ok(e) = rx.try_recv() {
        all.push(e);
    }
    let history: Vec<Value> = c.history(&key).unwrap();
    let emitted: Vec<Value> = all
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .filter(|v| v["message"]["type"] != "stream_event")
        .collect();
    assert!(emitted.len() < all.len(), "stream events were emitted");
    assert_eq!(history[0], json!({"kind": "state", "state": "starting"}));
    assert_eq!(history[1], json!({"kind": "state", "state": "idle"}));
    assert_eq!(history[2], json!({"kind": "user", "text": "bonjour"}));
    assert_eq!(history[3], json!({"kind": "state", "state": "running"}));
    assert_eq!(
        history.last().unwrap(),
        &json!({"kind": "state", "state": "closed"})
    );
    assert_eq!(history, emitted);
}

#[tokio::test]
async fn bridge_death_during_permission_crashes() {
    let (c, cwd) = claude("crash");
    let (sink, mut rx) = sink();
    let key = c
        .start_with_bridge(args(&cwd), &fake_bridge(), sink)
        .await
        .unwrap();
    c.send(&key, "crash".into()).await.unwrap();
    let ev = until(&mut rx, is_state(SessionState::Crashed)).await;
    let n = ev.len();
    assert!(
        matches!(&ev[n - 2], SessionEvent::PermissionCancelled { request_id } if request_id == "r1")
    );
    assert!(matches!(
        &ev[n - 1],
        SessionEvent::State { error: Some(_), .. }
    ));
    assert_gone(&pids(&ev));
    let err = c
        .permission_respond(&key, "r1".into(), "allow_once".into(), None)
        .await
        .unwrap_err();
    assert!(err.contains("inconnue"), "{err}");
    // A crashed session is dropped from the live table.
    assert_eq!(c.close(&key).await.unwrap_err(), "Session inconnue");
}

#[tokio::test]
async fn resume_reuses_key_and_adds_cost() {
    let (c, cwd) = claude("resume");
    let (first, mut rx) = sink();
    let key = c
        .start_with_bridge(args(&cwd), &fake_bridge(), first)
        .await
        .unwrap();
    c.send(&key, "bonjour".into()).await.unwrap();
    until(
        &mut rx,
        |e| matches!(e, SessionEvent::Sdk { message } if message["type"] == "result"),
    )
    .await;
    c.close(&key).await.unwrap();

    let (second, mut rx) = sink();
    let mut a = args(&cwd);
    a.resume = Some("fake-sess".into());
    let again = c
        .start_with_bridge(a, &fake_bridge(), second)
        .await
        .unwrap();
    assert_eq!(again, key);
    c.send(&key, "suite".into()).await.unwrap();
    until(
        &mut rx,
        |e| matches!(e, SessionEvent::Sdk { message } if message["type"] == "result"),
    )
    .await;
    c.close(&key).await.unwrap();

    let list = c.sessions_list().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].title, "bonjour");
    // 0.01 before the resume + 0.01 from the new process
    assert!(
        (list[0].cost_usd - 0.02).abs() < 1e-9,
        "{}",
        list[0].cost_usd
    );
    let history = c.history(&key).unwrap();
    let users: Vec<_> = history.iter().filter(|e| e["kind"] == "user").collect();
    assert_eq!(users.len(), 2);
}

#[tokio::test]
async fn cwd_and_claude_path_validated() {
    let (c, cwd) = claude("validate");
    for bad in ["relative/dir", "/", "/nonexistent-atelier-dir"] {
        let (sink, _rx) = sink();
        let mut a = args(&cwd);
        a.cwd = bad.into();
        let err = c
            .start_with_bridge(a, &fake_bridge(), sink)
            .await
            .unwrap_err();
        assert!(
            ["absolu", "racine", "introuvable"]
                .iter()
                .any(|w| err.contains(w)),
            "{bad}: {err}"
        );
    }
    for bad in ["claude", "/nonexistent/claude", "/etc/passwd"] {
        let err = c
            .settings_set(&Settings {
                claude_path: Some(bad.into()),
                ..Settings::default()
            })
            .unwrap_err();
        assert!(err.starts_with("Chemin de Claude Code"), "{bad}: {err}");
    }
    c.settings_set(&Settings::default()).unwrap();
}

#[tokio::test]
async fn permission_answered_once_and_models_timeout_withdrawn() {
    let (mut c, cwd) = claude("races");
    c.set_models_timeout(Duration::from_millis(300));
    let (sink, mut rx) = sink();
    let key = c
        .start_with_bridge(args(&cwd), &fake_bridge(), sink)
        .await
        .unwrap();

    c.send(&key, "perm".into()).await.unwrap();
    let pids = pids(&until(&mut rx, is_state(SessionState::WaitingPermission)).await);
    let (a, b) = tokio::join!(
        c.permission_respond(&key, "r1".into(), "allow_once".into(), None),
        c.permission_respond(&key, "r1".into(), "deny".into(), None),
    );
    assert!(a.is_ok(), "{a:?}");
    assert!(b.unwrap_err().contains("déjà traitée"));
    until(&mut rx, is_state(SessionState::Idle)).await;

    c.send(&key, "mute-models".into()).await.unwrap();
    until(&mut rx, is_state(SessionState::Idle)).await;
    assert!(c.models(&key).await.is_err());
    // The timed-out waiter was withdrawn: this reply is not swallowed by it.
    assert_eq!(c.models(&key).await.unwrap()[0]["value"], "haiku");

    c.close(&key).await.unwrap();
    assert_gone(&pids);
}

#[tokio::test]
async fn unknown_key_and_missing_claude() {
    let (c, cwd) = claude("errors");
    assert_eq!(
        c.send("s-0-0", "x".into()).await.unwrap_err(),
        "Session inconnue"
    );
    assert_eq!(c.history("s-0-0").unwrap_err(), "Session inconnue");
    // Valid when saved, gone when the session starts.
    let gone = cwd.join("claude");
    std::fs::copy("/bin/true", &gone).unwrap();
    c.settings_set(&Settings {
        claude_path: Some(gone.to_str().unwrap().into()),
        ..Settings::default()
    })
    .unwrap();
    std::fs::remove_file(&gone).unwrap();
    let (sink, _rx) = sink();
    let err = c
        .start_with_bridge(args(&cwd), &fake_bridge(), sink)
        .await
        .unwrap_err();
    assert!(err.starts_with("Claude Code introuvable : "), "{err}");
}

/// Real end-to-end check against Claude Haiku: `cargo test --test claude -- --ignored`.
/// Needs `npm ci` in bridge/ and a logged-in `claude` in PATH; costs a real (small) turn.
#[tokio::test]
#[ignore]
async fn real_haiku_says_hello() {
    init();
    let base = temp_dir("real");
    let c = Claude::new(Store::open(base.join("data")).unwrap());
    let cwd = base.join("empty");
    std::fs::create_dir_all(&cwd).unwrap();
    let (sink, mut rx) = sink();
    let mut a = args(&cwd);
    a.model = Some("haiku".into());
    let key = c.start(a, sink).await.unwrap();
    c.send(&key, "dis bonjour".into()).await.unwrap();
    let ev = tokio::time::timeout(
        Duration::from_secs(120),
        until(&mut rx, |e| {
            is_state(SessionState::Idle)(e) || is_state(SessionState::Crashed)(e)
        }),
    )
    .await
    .unwrap();
    for e in &ev {
        if let SessionEvent::Sdk { message } = e
            && matches!(message["type"].as_str(), Some("assistant" | "result"))
        {
            eprintln!("{message}");
        }
    }
    c.close(&key).await.unwrap();
    assert!(is_state(SessionState::Idle)(ev.last().unwrap()), "{ev:?}");
}
