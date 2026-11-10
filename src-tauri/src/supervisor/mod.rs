//! Module `supervisor`: see contracts/ipc.md §4.
//!
//! Recipe from spikes/orphans (TASK-005): the child leads its own process group, `kill()`/`Drop`
//! SIGKILL the whole group, and a watchdog (this binary relaunched as `watchdog <pgid>`) kills the
//! group when the app process dies by any means, SIGKILL and `panic = "abort"` included.

use std::io::Read;
use std::process::{ExitStatus, Stdio};

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

/// Overrides the watchdog executable. Integration tests need it: their `current_exe()` is the
/// test harness, which cannot run in watchdog mode, so they point it at the app binary.
const WATCHDOG_EXE_ENV: &str = "ATELIER_WATCHDOG_EXE";

pub struct Supervised {
    pub stdin: Option<ChildStdin>,
    pub stdout: Option<ChildStdout>,
    pub stderr: Option<ChildStderr>,
    child: Child,
    watchdog: Option<std::process::Child>,
    pgid: i32,
}

/// Lance `cmd` dans son propre groupe de process, avec un watchdog.
/// stdin/stdout/stderr sont forcés en `piped`.
pub fn spawn(mut cmd: Command) -> std::io::Result<Supervised> {
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()?;
    let Some(pid) = child.id() else {
        return Err(std::io::Error::other(
            "child exited before its pid was read",
        ));
    };
    let pgid = pid as i32;
    let watchdog = match spawn_watchdog(pgid) {
        Ok(w) => w,
        Err(e) => {
            kill_group(pgid);
            return Err(e);
        }
    };
    Ok(Supervised {
        stdin: child.stdin.take(),
        stdout: child.stdout.take(),
        stderr: child.stderr.take(),
        child,
        watchdog: Some(watchdog),
        pgid,
    })
}

/// The watchdog reads a pipe whose only write end we hold (O_CLOEXEC, so no other child inherits
/// it): EOF means this process is gone. Own process group so a terminal Ctrl-C does not reach it.
fn spawn_watchdog(pgid: i32) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;
    let exe = match std::env::var_os(WATCHDOG_EXE_ENV) {
        Some(exe) => exe.into(),
        None => std::env::current_exe()?,
    };
    std::process::Command::new(exe)
        .args(["watchdog", &pgid.to_string()])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .process_group(0)
        .spawn()
}

fn kill_group(pgid: i32) {
    // shortcut: the pgid may be reused once the whole group is dead and reaped; a pidfd of the
    // leader does not help (the group can outlive its leader), upgrade with a cgroup/systemd scope.
    unsafe { libc::killpg(pgid, libc::SIGKILL) };
}

impl Supervised {
    pub async fn wait(&mut self) -> std::io::Result<ExitStatus> {
        self.child.wait().await
    }

    /// SIGKILL au groupe entier ; idempotent.
    pub fn kill(&mut self) {
        // The watchdog doubles as the "not killed yet" flag.
        let Some(mut watchdog) = self.watchdog.take() else {
            return;
        };
        kill_group(self.pgid);
        // Kill the watchdog instead of closing its pipe, so it never fires a late killpg.
        let _ = watchdog.kill();
        let _ = watchdog.wait();
    }
}

impl Drop for Supervised {
    fn drop(&mut self) {
        self.kill();
    }
}

/// À appeler en tête de `main()` : si l'app a été relancée en mode watchdog, fait le travail et
/// ne revient jamais ; sinon ne fait rien.
pub fn maybe_run_watchdog() {
    let args: Vec<String> = std::env::args().skip(1).take(3).collect();
    if args.first().map(String::as_str) != Some("watchdog") {
        return;
    }
    // pgid 0 or negative would make killpg target our own group or fail oddly: refuse it.
    let pgid = match args.get(1).and_then(|a| a.parse::<i32>().ok()) {
        Some(pgid) if pgid > 1 && args.len() == 2 => pgid,
        _ => std::process::exit(2),
    };
    let _ = std::io::stdin().read_to_end(&mut Vec::new());
    kill_group(pgid);
    std::process::exit(0);
}
