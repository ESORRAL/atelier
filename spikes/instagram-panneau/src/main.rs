// Spike TASK-045: Instagram child webview reparented by hand into a GtkOverlay, as a panel that slides
// in from the left next to the rail, over the main webview.
use std::cell::RefCell;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use gtk::prelude::*;
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{
    AppHandle, Listener, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl, Window,
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

const RAIL: i32 = 56;
const TOP_BAR: i32 = 56;
const PANEL_WIDTH: i32 = 420;
const SLIDE_MS: u32 = 200;

/// Labels of every webview whose call reached Rust.
static PROBE_CALLS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// GTK widgets of the panel layout; GTK objects live on the main thread only.
struct Panel {
    toplevel: gtk::ApplicationWindow,
    overlay: gtk::Overlay,
    revealer: gtk::Revealer,
    main: gtk::Widget,
    child: gtk::Widget,
}

thread_local! {
    static PANEL: RefCell<Option<Panel>> = const { RefCell::new(None) };
}

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

/// The WebKit widget behind a Tauri webview. Must run on the main thread (with_webview is then synchronous).
fn gtk_widget(webview: &Webview) -> gtk::Widget {
    // gtk::Widget is not Send: hand it over through a main-thread slot instead of a channel.
    thread_local! {
        static SLOT: RefCell<Option<gtk::Widget>> = const { RefCell::new(None) };
    }
    webview
        .with_webview(|pw| SLOT.with(|s| *s.borrow_mut() = Some(pw.inner().upcast())))
        .unwrap();
    SLOT.with(|s| s.borrow_mut().take())
        .expect("with_webview did not run synchronously on the main thread")
}

/// Takes both WebKit widgets out of Tauri's vertical GtkBox and puts them in a GtkOverlay:
/// `main` fills it, `instagram` sits in a left-anchored GtkRevealer below the top bar, next to the rail.
fn install_panel(window: &Window) -> tauri::Result<()> {
    let vbox = window.default_vbox()?;
    let main = gtk_widget(&window.get_webview("main").unwrap());
    let child = gtk_widget(&window.get_webview("instagram").unwrap());
    vbox.remove(&main);
    vbox.remove(&child);

    let overlay = gtk::Overlay::new();
    overlay.add(&main);
    let revealer = gtk::Revealer::builder()
        .transition_type(gtk::RevealerTransitionType::SlideRight)
        .transition_duration(SLIDE_MS)
        .halign(gtk::Align::Start)
        .valign(gtk::Align::Fill)
        .margin_start(RAIL)
        .margin_top(TOP_BAR)
        .build();
    child.set_size_request(PANEL_WIDTH, -1);
    revealer.add(&child);
    overlay.add_overlay(&revealer);
    vbox.pack_start(&overlay, true, true, 0);
    overlay.show_all();

    // Counts the frames of each slide: proof that the animation is not a jump.
    let main_view = main.clone();
    revealer.connect_reveal_child_notify(move |r| {
        let frames = std::rc::Rc::new(std::cell::Cell::new(0u32));
        let main_view = main_view.clone();
        r.add_tick_callback(move |r, _| {
            frames.set(frames.get() + 1);
            let done = r.is_child_revealed() == r.reveals_child() && frames.get() > 1;
            if done {
                // Without it, a strip of the closed panel stays unpainted on X11 (seen after a resize).
                main_view.queue_draw();
                println!(
                    "SLIDE reveal={} frames={} width={}",
                    r.reveals_child(),
                    frames.get(),
                    r.allocated_width()
                );
            }
            gtk::glib::ControlFlow::from(!done)
        });
    });

    let toplevel = window.gtk_window()?;
    PANEL.with(|p| {
        *p.borrow_mut() = Some(Panel {
            toplevel,
            overlay,
            revealer,
            main,
            child,
        })
    });
    Ok(())
}

/// Runs `f` on the main thread with the panel and waits for its result.
fn on_main<R: Send + 'static>(app: &AppHandle, f: impl FnOnce(&Panel) -> R + Send + 'static) -> R {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let r = PANEL.with(|p| f(p.borrow().as_ref().expect("panel not installed")));
        let _ = tx.send(r);
    })
    .unwrap();
    rx.recv().unwrap()
}

fn alloc(w: &impl IsA<gtk::Widget>, base: &gtk::Overlay) -> String {
    // Position relative to the overlay, i.e. to the window content.
    let (x, y) = w.translate_coordinates(base, 0, 0).unwrap_or((-1, -1));
    format!(
        "{x},{y} {}x{} visible={} focus={}",
        w.allocated_width(),
        w.allocated_height(),
        w.is_visible() && w.is_mapped(),
        w.has_focus()
    )
}

fn dump(app: &AppHandle, phase: &str) {
    let line = on_main(app, |p| {
        format!(
            "overlay {} | main {} | revealer {} | child {}",
            alloc(&p.overlay, &p.overlay),
            alloc(&p.main, &p.overlay),
            alloc(&p.revealer, &p.overlay),
            alloc(&p.child, &p.overlay)
        )
    });
    println!("PHASE {phase}");
    println!("LAYOUT {phase} {line}");
    // Leaves time for run-test.sh to capture this phase before the next action.
    std::thread::sleep(Duration::from_secs(2));
}

fn is_x11() -> bool {
    gtk::gdk::Display::default().is_some_and(|d| d.type_().name() == "GdkX11Display")
}

/// X11 only: key press sent to the toplevel; GTK routes it to the focused widget.
fn key(app: &AppHandle, keyval: u32) {
    on_main(app, move |p| {
        if !is_x11() {
            return;
        }
        let win = p.toplevel.window().unwrap();
        for t in [
            gtk::gdk::EventType::KeyPress,
            gtk::gdk::EventType::KeyRelease,
        ] {
            gtk::gdk::test_simulate_key(&win, -1, -1, keyval, gtk::gdk::ModifierType::empty(), t);
        }
    });
}

fn reveal(app: &AppHandle, open: bool) {
    on_main(app, move |p| p.revealer.set_reveal_child(open));
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
                .title("atelier (spike panneau)")
                .inner_size(w, h)
                .build()?;
            // Bounds are irrelevant: the GtkOverlay lays both webviews out.
            let origin = LogicalPosition::new(0.0, 0.0);
            window.add_child(
                WebviewBuilder::new("main", WebviewUrl::App("index.html".into())),
                origin,
                LogicalSize::new(w, h),
            )?;
            let extra_host = child_url.host_str().map(str::to_owned);
            window.add_child(
                child_builder("instagram", child_url.clone(), child_dir.clone(), extra_host),
                origin,
                LogicalSize::new(w, h),
            )?;
            install_panel(&window)?;

            let handle = app.handle().clone();
            let sleep = |ms| std::thread::sleep(Duration::from_millis(ms));
            std::thread::spawn(move || {
                sleep(4000);
                dump(&handle, "initial-closed");
                reveal(&handle, true);
                sleep(600);
                dump(&handle, "opened");
                if !test_mode {
                    sleep(12000);
                    handle.exit(0);
                    return;
                }
                let win = handle.get_window("atelier").unwrap();
                win.set_size(LogicalSize::new(800.0, 500.0)).unwrap();
                sleep(1500);
                dump(&handle, "resized");

                let child = handle.get_webview("instagram").unwrap();
                child.set_focus().unwrap();
                sleep(500);
                key(&handle, 'k' as u32);
                sleep(800);
                dump(&handle, "child-focused");
                handle.get_webview("main").unwrap().set_focus().unwrap();
                sleep(500);
                key(&handle, 'm' as u32);
                sleep(800);
                dump(&handle, "main-focused");

                // Tauri's own hide/show still drives the reparented widget.
                child.hide().unwrap();
                sleep(500);
                dump(&handle, "tauri-hidden");
                child.show().unwrap();
                sleep(500);
                dump(&handle, "tauri-shown");

                reveal(&handle, false);
                sleep(600);
                dump(&handle, "closed");
                for _ in 0..20 {
                    reveal(&handle, true);
                    sleep(350);
                    reveal(&handle, false);
                    sleep(350);
                }
                println!("CYCLES done");
                reveal(&handle, true);
                sleep(1500);
                dump(&handle, "after-cycles");

                // Cookie isolation: one webview on the default store, one on the child's (control).
                let check = child_url.join("/cookie.html").unwrap();
                let (mut a, mut b) = (check.clone(), check);
                a.set_query(Some("store=main"));
                b.set_query(Some("store=child"));
                let s = LogicalSize::new(10.0, 10.0);
                win.add_child(WebviewBuilder::new("check-main", WebviewUrl::External(a)), origin, s).unwrap();
                win.add_child(WebviewBuilder::new("check-child", WebviewUrl::External(b)).data_directory(child_dir), origin, s).unwrap();
                sleep(4000);
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
