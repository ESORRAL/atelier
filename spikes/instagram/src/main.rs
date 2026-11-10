// Spike TASK-003: an isolated window showing an external site, with no access to the app API.
use std::sync::Mutex;
use std::time::Duration;

use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const DEFAULT_PAUSE_URL: &str = "https://www.instagram.com/";
const ALLOWED_DOMAINS: &[&str] = &["instagram.com", "cdninstagram.com", "facebook.com"];

/// Labels of every window whose call reached Rust.
static PROBE_CALLS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[tauri::command]
fn probe(window: WebviewWindow) -> String {
    let label = window.label().to_string();
    println!("PROBE_REACHED_RUST from={label}");
    PROBE_CALLS.lock().unwrap().push(label.clone());
    format!("probe ok from {label}")
}

fn host_allowed(url: &Url, extra_host: Option<&str>) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if url.scheme() != "https" && Some(host) != extra_host {
        return false;
    }
    Some(host) == extra_host
        || ALLOWED_DOMAINS
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

fn main() {
    let pause_url: Url = std::env::var("PAUSE_URL")
        .unwrap_or_else(|_| DEFAULT_PAUSE_URL.into())
        .parse()
        .expect("PAUSE_URL is not a valid URL");
    let test_mode = std::env::var("ISOLATION_TEST").is_ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![probe])
        .setup(move |app| {
            let pause_dir = app.path().app_local_data_dir()?.join("pause-webview");
            println!("PAUSE_DATA_DIR={}", pause_dir.display());

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("main")
                .build()?;

            // The PAUSE_URL host is allowed so a local test page can be served over plain http.
            let extra_host = pause_url.host_str().map(str::to_owned);
            WebviewWindowBuilder::new(app, "pause", WebviewUrl::External(pause_url.clone()))
                .title("pause")
                .data_directory(pause_dir.clone())
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
                .build()?;

            if test_mode {
                let handle = app.handle().clone();
                let check_url = pause_url.join("/cookie.html").unwrap();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    // Same store as main (default context) vs same store as pause (control).
                    let h = handle.clone();
                    let (u1, u2, dir) = (check_url.clone(), check_url, pause_dir);
                    handle
                        .run_on_main_thread(move || {
                            let mut a = u1;
                            a.set_query(Some("store=main"));
                            let mut b = u2;
                            b.set_query(Some("store=pause"));
                            WebviewWindowBuilder::new(&h, "check-main", WebviewUrl::External(a))
                                .build()
                                .unwrap();
                            WebviewWindowBuilder::new(&h, "check-pause", WebviewUrl::External(b))
                                .data_directory(dir)
                                .build()
                                .unwrap();
                        })
                        .unwrap();
                    std::thread::sleep(Duration::from_secs(4));
                    let calls = PROBE_CALLS.lock().unwrap().clone();
                    println!("PROBE_CALLS {}", calls.join(","));
                    handle.exit(0);
                });
            }
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
        assert!(ok("https://m.facebook.com/login", None));
        assert!(!ok("http://www.instagram.com/", None));
        assert!(!ok("https://evilinstagram.com/", None));
        assert!(!ok("https://example.com/", None));
        assert!(ok("http://127.0.0.1:8000/x", Some("127.0.0.1")));
        assert!(!ok("http://localhost:8000/x", Some("127.0.0.1")));
    }
}
