//! Spike parent: `atelier-orphan-spike <technique> <marker> <normal|setsid>`.
//! Spawns `node` (child) which spawns `sleep 300` (grandchild), then waits for a death order:
//! SIGUSR1 = normal exit, SIGUSR2 = panic, SIGTERM = handled termination, SIGKILL = brutal.
//! Internal mode: `atelier-orphan-spike watchdog <target> <marker>-watchdog`.

use std::any::Any;
use std::io::Read;
use std::process::Stdio;

use process_wrap::tokio::{CommandWrap, KillOnDrop, ProcessGroup};
use tokio::process::Command;
use tokio::signal::unix::{SignalKind, signal};

// Child = node; grandchild = sleep renamed through `exec -a` so `pgrep -f` can find it.
const NODE_SCRIPT: &str = "const [m, mode] = process.argv.slice(1); \
    require('child_process').spawn('bash', ['-c', 'exec -a ' + m.replace(/-child$/, '-grandchild') + ' sleep 300'], \
    { stdio: 'ignore', detached: mode === 'setsid' }); setInterval(() => {}, 1000);";

/// Kills a process group (`<pgid>`) or a systemd scope (`scope:<unit>`).
fn kill_target(target: &str) {
    if let Some(unit) = target.strip_prefix("scope:") {
        let _ = std::process::Command::new("systemctl")
            .args(["--user", "kill", "--signal=SIGKILL", &format!("{unit}.scope")])
            .stderr(Stdio::null())
            .status();
    } else if let Ok(pgid) = target.parse::<i32>() {
        // shortcut: pgid may be reused after the group died, upgrade by holding a pidfd of the leader.
        unsafe { libc::killpg(pgid, libc::SIGKILL) };
    }
}

/// Waits for EOF on stdin, which happens only when the parent process is gone (any death),
/// then kills the target.
fn watchdog(target: &str) {
    let _ = std::io::stdin().read_to_end(&mut Vec::new());
    kill_target(target);
}

/// Spawns the watchdog in its own process group, so a terminal Ctrl-C does not kill it first.
fn spawn_watchdog(target: &str, marker: &str) -> std::process::Child {
    use std::os::unix::process::CommandExt;
    std::process::Command::new(std::env::current_exe().unwrap())
        .args(["watchdog", target, &format!("{marker}-watchdog")])
        .stdin(Stdio::piped())
        .process_group(0)
        .spawn()
        .unwrap()
}

/// Holds whatever must live as long as the parent; kills `kill` on drop (normal exit, panic, SIGTERM).
struct Guard {
    kill: Option<String>,
    _keep: Vec<Box<dyn Any>>,
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Some(target) = &self.kill {
            kill_target(target);
        }
    }
}

fn spawn(tech: &str, marker: &str, mode: &str) -> Guard {
    let child_marker = format!("{marker}-child");
    let mut node = Command::new("node");
    node.args(["-e", NODE_SCRIPT, &child_marker, mode]);
    let keep = |c: Box<dyn Any>| vec![c];
    match tech {
        "none" => Guard { kill: None, _keep: keep(Box::new(node.spawn().unwrap())) },
        "kill_on_drop" => {
            Guard { kill: None, _keep: keep(Box::new(node.kill_on_drop(true).spawn().unwrap())) }
        }
        "process_wrap" => {
            let mut cmd = CommandWrap::from(node);
            cmd.wrap(ProcessGroup::leader()).wrap(KillOnDrop);
            Guard { kill: None, _keep: keep(Box::new(cmd.spawn().unwrap())) }
        }
        "pdeathsig" => {
            unsafe {
                node.pre_exec(|| {
                    libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
                    Ok(())
                });
            }
            Guard { kill: None, _keep: keep(Box::new(node.spawn().unwrap())) }
        }
        "pgroup" | "recipe" => {
            let child = node.process_group(0).spawn().unwrap();
            let pgid = child.id().unwrap().to_string();
            let mut keep = keep(Box::new(child));
            if tech == "recipe" {
                keep.push(Box::new(spawn_watchdog(&pgid, marker)));
            }
            Guard { kill: Some(pgid), _keep: keep }
        }
        "scope" => {
            let child = Command::new("systemd-run")
                .args(["--user", "--scope", "--quiet", "--unit", marker, "node", "-e", NODE_SCRIPT])
                .args([&child_marker, mode])
                .spawn()
                .unwrap();
            let target = format!("scope:{marker}");
            let watchdog = spawn_watchdog(&target, marker);
            Guard { kill: Some(target), _keep: vec![Box::new(child), Box::new(watchdog)] }
        }
        other => panic!("unknown technique {other}"),
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args[0] == "watchdog" {
        return watchdog(&args[1]);
    }
    // Lets a test prove that it fails when the protection is removed.
    let tech = if std::env::var_os("ATELIER_SPIKE_UNPROTECT").is_some() { "none" } else { &args[0] };
    let (mut term, mut usr1, mut usr2) = (
        signal(SignalKind::terminate()).unwrap(),
        signal(SignalKind::user_defined1()).unwrap(),
        signal(SignalKind::user_defined2()).unwrap(),
    );
    let _guard = spawn(tech, &args[1], &args[2]);
    tokio::select! {
        _ = term.recv() => {}
        _ = usr1.recv() => {}
        _ = usr2.recv() => panic!("requested panic"),
    }
}
