//! Technique x death matrix. Each cell lists what survives 2 s after the parent died:
//! E = child (node), P = grandchild (sleep), W = watchdog, "-" = nothing.

use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_atelier-orphan-spike");
const DEATHS: [(&str, i32); 4] = [
    ("exit", libc::SIGUSR1),
    ("panic", libc::SIGUSR2),
    ("sigterm", libc::SIGTERM),
    ("sigkill", libc::SIGKILL),
];

fn alive(pattern: &str) -> bool {
    Command::new("pgrep").args(["-f", pattern]).output().unwrap().status.success()
}

fn scenario(tech: &str, mode: &str, death: &str, sig: i32, unprotect: bool) -> String {
    let marker = format!("atelier-orphan-spike-{}-{tech}-{mode}-{death}", std::process::id())
        .replace('_', "-");
    let mut cmd = Command::new(BIN);
    cmd.args([tech, &marker, mode]);
    if unprotect {
        cmd.env("ATELIER_SPIKE_UNPROTECT", "1");
    }
    let mut parent = cmd.spawn().unwrap();
    let (child, grandchild, watchdog) =
        (format!("{marker}-child"), format!("{marker}-grandchild"), format!("{marker}-watchdog"));

    let start = Instant::now();
    while !(alive(&child) && alive(&grandchild)) {
        assert!(start.elapsed() < Duration::from_secs(10), "{marker}: chain never started");
        thread::sleep(Duration::from_millis(100));
    }
    unsafe { libc::kill(parent.id() as i32, sig) };
    let status = parent.wait().unwrap();
    match death {
        "exit" | "sigterm" => assert!(status.success(), "{marker}: {status}"),
        "panic" => assert_eq!(status.code(), Some(101), "{marker}: did not panic"),
        _ => {}
    }
    thread::sleep(Duration::from_secs(2));

    let mut cell = String::new();
    for (pattern, code) in [(&child, 'E'), (&grandchild, 'P'), (&watchdog, 'W')] {
        if alive(pattern) {
            cell.push(code);
        }
    }
    // Only ever kill processes carrying this scenario's own marker.
    let _ = Command::new("pkill").args(["-KILL", "-f", &marker]).status();
    if cell.is_empty() { "-".into() } else { cell }
}

fn check(tech: &str, mode: &str, expected: [&str; 4]) {
    check_with(tech, mode, expected, false)
}

fn check_with(tech: &str, mode: &str, expected: [&str; 4], unprotect: bool) {
    let handles: Vec<_> = DEATHS
        .iter()
        .map(|&(death, sig)| {
            let (tech, mode) = (tech.to_string(), mode.to_string());
            thread::spawn(move || scenario(&tech, &mode, death, sig, unprotect))
        })
        .collect();
    let got: Vec<String> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("| {tech} ({mode}) | {} |", got.join(" | "));
    assert_eq!(got, expected, "{tech} ({mode}): exit, panic, sigterm, sigkill");
}

#[test]
fn none() {
    check("none", "normal", ["EP", "EP", "EP", "EP"]);
}

#[test]
fn kill_on_drop() {
    check("kill_on_drop", "normal", ["P", "P", "P", "EP"]);
}

#[test]
fn process_wrap_group_kill_on_drop() {
    check("process_wrap", "normal", ["P", "P", "P", "EP"]);
}

#[test]
fn pdeathsig() {
    check("pdeathsig", "normal", ["P", "P", "P", "P"]);
}

#[test]
fn pgroup_killpg_on_drop() {
    check("pgroup", "normal", ["-", "-", "-", "EP"]);
}

#[test]
fn recipe() {
    check("recipe", "normal", ["-", "-", "-", "-"]);
}

#[test]
fn recipe_setsid() {
    check("recipe", "setsid", ["P", "P", "P", "P"]);
}

#[test]
fn scope() {
    check("scope", "normal", ["-", "-", "-", "-"]);
}

#[test]
fn scope_setsid() {
    check("scope", "setsid", ["-", "-", "-", "-"]);
}

/// Run with `cargo test -- --ignored unprotected` to see the recipe test fail without protection.
#[test]
#[ignore]
fn unprotected_recipe_fails() {
    check_with("recipe", "normal", ["-", "-", "-", "-"], true);
}
