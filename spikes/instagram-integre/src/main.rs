// Spike TASK-044: Instagram as a child webview inside the main window (multiwebview, feature `unstable`).
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{
    AppHandle, Listener, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    Url, Webview, WebviewUrl, WindowEvent,
};

const DEFAULT_CHILD_URL: &str = "https://www.instagram.com/";
// Same allowlist as src-tauri/src/windows/mod.rs.
const ALLOWED_DOMAINS: &[&str] = &[
    "instagram.com",
    "cdninstagram.com",
    "facebook.com",
    "fbsbx.com",
    "google.com",
    "gstatic.com",
    "recaptcha.net",
];
const EXTERNAL_HOSTS: &[&str] = &["l.facebook.com"];

/// Labels of every webview whose call reached Rust.
static PROBE_CALLS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[tauri::command]
fn probe(webview: Webview) -> String {
    let label = webview.label().to_string();
    println!("PROBE_REACHED_RUST from={label}");
    PROBE_CALLS.lock().unwrap().push(label.clone());
    format!("probe ok from {label}")
}

#[tauri::command]
fn report(webview: Webview, msg: String) {
    println!("REPORT {} {msg}", webview.label());
}

fn host_allowed(url: &Url, extra_host: Option<&str>) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if Some(host) == extra_host {
        return true;
    }
    url.scheme() == "https"
        && !EXTERNAL_HOSTS.contains(&host)
        && ALLOWED_DOMAINS
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

/// Right half of a window of logical size `w` x `h`: the zone the app page leaves empty.
fn slot(w: f64, h: f64) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (
        LogicalPosition::new(w / 2.0, 0.0),
        LogicalSize::new(w / 2.0, h),
    )
}

fn dump(app: &AppHandle, phase: &str) {
    println!("PHASE {phase}");
    for label in ["main", "instagram"] {
        if let Some(w) = app.get_webview(label) {
            println!(
                "BOUNDS {phase} {label} pos={:?} size={:?}",
                w.position().map(|p| (p.x, p.y)),
                w.size().map(|s| (s.width, s.height))
            );
        }
    }
    // Leaves time for run-test.sh to capture this phase before the next action.
    std::thread::sleep(Duration::from_secs(2));
}

fn child_builder(
    label: &str,
    url: Url,
    dir: PathBuf,
    extra_host: Option<String>,
) -> WebviewBuilder<tauri::Wry> {
    WebviewBuilder::new(label, WebviewUrl::External(url))
        .data_directory(dir)
        .on_navigation(move |url| {
            let ok = host_allowed(url, extra_host.as_deref());
            if !ok {
                println!("NAVIGATION_BLOCKED {url}");
            }
            ok
        })
        .on_new_window(|url, _| {
            println!("NEW_WINDOW_BLOCKED {url}");
            NewWindowResponse::Deny
        })
}

fn main() {
    let child_url: Url = std::env::var("CHILD_URL")
        .unwrap_or_else(|_| DEFAULT_CHILD_URL.into())
        .parse()
        .expect("CHILD_URL is not a valid URL");
    let test_mode = std::env::var("ISOLATION_TEST").is_ok();
    let extra_cap = std::env::var("EXTRA_CAP").ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![probe, report])
        .setup(move |app| {
            // Sibling of the default store, not a sub-folder (lesson from TASK-003).
            let default_dir = app.path().app_local_data_dir()?;
            let child_dir = PathBuf::from(format!("{}-instagram", default_dir.display()));
            println!("CHILD_DATA_DIR={}", child_dir.display());

            if let Some(kind) = extra_cap.as_deref() {
                // Test-only variants, to show what the isolation test detects.
                let target = match kind {
                    "window" => r#""windows": ["atelier"]"#,
                    _ => r#""webviews": ["main"]"#,
                };
                let port = child_url.port().unwrap_or(80);
                app.add_capability(format!(
                    r#"{{"identifier":"extra-{kind}",{target},"remote":{{"urls":["http://127.0.0.1:{port}/*"]}},"permissions":["allow-probe","core:event:default"]}}"#
                ))?;
                println!("EXTRA_CAP {kind}");
            }
            app.listen_any("spike-leak", |e| println!("EMIT_REACHED payload={}", e.payload()));

            let (w, h) = (1000.0, 640.0);
            let window = WindowBuilder::new(app, "atelier")
                .title("atelier (spike multiwebview)")
                .inner_size(w, h)
                .build()?;
            window.add_child(
                WebviewBuilder::new("main", WebviewUrl::App("index.html".into())),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(w, h),
            )?;
            let extra_host = child_url.host_str().map(str::to_owned);
            let (pos, size) = slot(w, h);
            window.add_child(
                child_builder("instagram", child_url.clone(), child_dir.clone(), extra_host),
                pos,
                size,
            )?;

            // The app has to keep the child on its slot; here the slot is the right half.
            // Physical units: a sync getter such as scale_factor() here deadlocks the event loop.
            let win = window.clone();
            window.on_window_event(move |e| {
                if let WindowEvent::Resized(s) = e {
                    let (w, h) = (s.width / 2, s.height);
                    if let Some(c) = win.get_webview("instagram") {
                        let _ = c.set_position(PhysicalPosition::new(w, 0));
                        let _ = c.set_size(PhysicalSize::new(w, h));
                    }
                    if let Some(m) = win.get_webview("main") {
                        let _ = m.set_size(*s);
                    }
                }
            });

            let handle = app.handle().clone();
            let sleep = |s| std::thread::sleep(Duration::from_secs(s));
            std::thread::spawn(move || {
                sleep(5);
                dump(&handle, "initial");
                if !test_mode {
                    return;
                }
                let child = handle.get_webview("instagram").unwrap();
                let win = handle.get_window("atelier").unwrap();
                win.set_size(LogicalSize::new(800.0, 500.0)).unwrap();
                sleep(3);
                dump(&handle, "resized");
                child.hide().unwrap();
                sleep(3);
                dump(&handle, "hidden");
                child.show().unwrap();
                sleep(3);
                dump(&handle, "shown");
                child.set_focus().unwrap();
                sleep(2);
                dump(&handle, "child-focused");
                handle.get_webview("main").unwrap().set_focus().unwrap();
                sleep(2);
                dump(&handle, "main-focused");

                // Cookie isolation: one webview on the default store, one on the child's (control).
                let check = child_url.join("/cookie.html").unwrap();
                let (mut a, mut b) = (check.clone(), check);
                a.set_query(Some("store=main"));
                b.set_query(Some("store=child"));
                win.add_child(WebviewBuilder::new("check-main", WebviewUrl::External(a)), LogicalPosition::new(0.0, 0.0), LogicalSize::new(10.0, 10.0)).unwrap();
                win.add_child(WebviewBuilder::new("check-child", WebviewUrl::External(b)).data_directory(child_dir), LogicalPosition::new(0.0, 0.0), LogicalSize::new(10.0, 10.0)).unwrap();
                sleep(4);
                let calls = PROBE_CALLS.lock().unwrap().clone();
                println!("PROBE_CALLS {}", calls.join(","));
                let labels: Vec<String> = handle.webviews().into_keys().collect();
                println!("WEBVIEWS {}", labels.join(","));
                handle.exit(0);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist() {
        let ok = |s: &str, extra| host_allowed(&s.parse().unwrap(), extra);
        assert!(ok("https://www.instagram.com/reels/", None));
        assert!(ok("https://scontent.cdninstagram.com/x.mp4", None));
        assert!(!ok("http://www.instagram.com/", None));
        assert!(!ok("https://instagram.com.evil.example/", None));
        assert!(!ok("https://l.facebook.com/l.php?u=x", None));
        assert!(ok("http://127.0.0.1:8000/x", Some("127.0.0.1")));
        assert!(!ok("http://localhost:8000/x", Some("127.0.0.1")));
    }
}
