//! Integration tests for `supervisor`: chain `sh -c` (child) -> `sleep` (grandchild).
//! Processes are found through a unique marker placed in their environment, and only processes
//! carrying that marker are ever killed by the cleanup.

use std::sync::Once;
use std::time::{Duration, Instant};

use atelier_lib::supervisor;
use tokio::process::Command;

const MARKER_ENV: &str = "ATELIER_SUPERVISOR_TEST_MARKER";
const HELPER_ENV: &str = "ATELIER_SUPERVISOR_TEST_HELPER";

fn init() {
    static ONCE: Once = Once::new();
    // The test harness cannot run in watchdog mode: point the watchdog at the app binary.
    // Safe enough: every test calls this before touching the environment or spawning threads.
    ONCE.call_once(|| unsafe {
        std::env::set_var("ATELIER_WATCHDOG_EXE", env!("CARGO_BIN_EXE_atelier"))
    });
}

fn marker(name: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("atelier-sup-test-{}-{nanos}-{name}", std::process::id())
}

/// Live (non-zombie) pids whose environment holds `MARKER_ENV=<marker>`.
fn marked(marker: &str) -> Vec<i32> {
    let needle = format!("{MARKER_ENV}={marker}");
    std::fs::read_dir("/proc")
        .unwrap()
        .filter_map(|e| e.ok()?.file_name().to_str()?.parse::<i32>().ok())
        .filter(|pid| {
            std::fs::read(format!("/proc/{pid}/environ"))
                .map(|env| env.split(|b| *b == 0).any(|v| v == needle.as_bytes()))
                .unwrap_or(false)
        })
        .collect()
}

fn wait_for(marker: &str, count: usize, within: Duration) -> Vec<i32> {
    let deadline = Instant::now() + within;
    loop {
        let pids = marked(marker);
        if pids.len() == count || Instant::now() >= deadline {
            return pids;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Kills whatever still carries the marker, so a failing test leaves no orphan behind.
struct Cleanup(String);

impl Drop for Cleanup {
    fn drop(&mut self) {
        for pid in marked(&self.0) {
            unsafe { libc::kill(pid, libc::SIGKILL) };
        }
    }
}

fn chain(marker: &str) -> Command {
    let mut cmd = Command::new("sh");
    // `& wait` keeps sh alive as the child instead of exec-ing into sleep.
    cmd.args(["-c", "sleep 300 & wait"]).env(MARKER_ENV, marker);
    cmd
}

fn spawn_chain(marker: &str) -> supervisor::Supervised {
    let s = supervisor::spawn(chain(marker)).unwrap();
    assert_eq!(
        wait_for(marker, 2, Duration::from_secs(5)).len(),
        2,
        "chain did not start"
    );
    s
}

#[tokio::test]
async fn kill_leaves_nothing_and_is_idempotent() {
    init();
    let m = marker("kill");
    let _cleanup = Cleanup(m.clone());
    let mut s = spawn_chain(&m);
    assert!(s.stdin.is_some() && s.stdout.is_some() && s.stderr.is_some());
    s.kill();
    assert_eq!(wait_for(&m, 0, Duration::from_secs(2)), Vec::<i32>::new());
    s.kill();
    let status = s.wait().await.unwrap();
    assert!(!status.success());
}

#[tokio::test]
async fn pipes_are_forced() {
    init();
    let m = marker("pipes");
    let _cleanup = Cleanup(m.clone());
    let mut cmd = chain(&m);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null());
    let s = supervisor::spawn(cmd).unwrap();
    assert!(s.stdin.is_some() && s.stdout.is_some() && s.stderr.is_some());
}

#[tokio::test]
async fn drop_leaves_nothing() {
    init();
    let m = marker("drop");
    let _cleanup = Cleanup(m.clone());
    drop(spawn_chain(&m));
    assert_eq!(wait_for(&m, 0, Duration::from_secs(2)), Vec::<i32>::new());
}

#[test]
fn sigkill_of_parent_leaves_nothing() {
    init();
    let m = marker("sigkill");
    let _cleanup = Cleanup(m.clone());
    let mut parent = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "sigkill_helper", "--ignored", "--nocapture"])
        .env(HELPER_ENV, &m)
        .stdout(std::process::Stdio::null())
        .spawn()
        .unwrap();
    assert_eq!(
        wait_for(&m, 2, Duration::from_secs(10)).len(),
        2,
        "helper did not start the chain"
    );
    parent.kill().unwrap();
    parent.wait().unwrap();
    assert_eq!(wait_for(&m, 0, Duration::from_secs(2)), Vec::<i32>::new());
}

/// Parent process for `sigkill_of_parent_leaves_nothing`: spawns the chain and blocks forever.
#[test]
#[ignore]
fn sigkill_helper() {
    let Ok(m) = std::env::var(HELPER_ENV) else {
        return;
    };
    init();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let _s = supervisor::spawn(chain(&m)).unwrap();
        std::future::pending::<()>().await
    });
}
