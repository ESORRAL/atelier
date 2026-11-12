// Spike TASK-049: CPU and frame smoothness of a heavy page in three layouts.
// MODE=window (separate window) | child (plain child webview) | overlay (GtkOverlay + GtkRevealer, as in the app).
// OPEN=0 keeps the page hidden (closed panel / hidden window). ACCEL=always|never sets the panel's
// hardware-acceleration-policy. REVEAL_MS sets the revealer transition. MAIN_ANIM=1|2 animates the main page.
// GPU_DUMP=1 prints the page's innerText (for webkit://gpu). SECS: run time.
use std::cell::RefCell;
use std::time::Duration;

use gtk::prelude::*;
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl};
use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};

const RAIL: i32 = 56;
const TOP_BAR: i32 = 56;
const PANEL_WIDTH: i32 = 420;

thread_local! {
    static REVEALER: RefCell<Option<gtk::Revealer>> = const { RefCell::new(None) };
}

fn env(k: &str, d: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| d.into())
}

fn webkit(webview: &Webview) -> webkit2gtk::WebView {
    thread_local! {
        static SLOT: RefCell<Option<webkit2gtk::WebView>> = const { RefCell::new(None) };
    }
    webview
        .with_webview(|pw| SLOT.with(|s| *s.borrow_mut() = Some(pw.inner())))
        .unwrap();
    SLOT.with(|s| s.borrow_mut().take()).unwrap()
}

fn tune(view: &webkit2gtk::WebView, name: &str) {
    let s = WebViewExt::settings(view).unwrap();
    match env("ACCEL", "").as_str() {
        "always" => s.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Always),
        "never" => s.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never),
        _ => {}
    }
    println!(
        "SETTINGS {name} accel={:?} webgl={}",
        s.hardware_acceleration_policy(),
        s.enables_webgl()
    );
}

fn main() {
    let mode = env("MODE", "overlay");
    let open = env("OPEN", "1") == "1";
    let child_url: Url = env("CHILD_URL", "about:blank").parse().unwrap();
    let main_page = format!("index.html?anim={}", env("MAIN_ANIM", "0"));
    let secs: u64 = env("SECS", "30").parse().unwrap();
    for k in ["WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_DISABLE_COMPOSITING_MODE", "GDK_GL", "GDK_BACKEND"] {
        println!("ENV {k}={}", env(k, "<unset>"));
    }

    tauri::Builder::default()
        .setup(move |app| {
            let (w, h) = (1000.0, 760.0);
            let window = WindowBuilder::new(app, "atelier")
                .title("atelier (spike perf)")
                .inner_size(w, h)
                .build()?;
            let origin = LogicalPosition::new(0.0, 0.0);
            let main = window.add_child(
                WebviewBuilder::new("main", WebviewUrl::App(main_page.clone().into())),
                origin,
                LogicalSize::new(w, h),
            )?;
            tune(&webkit(&main), "main");
            let builder = WebviewBuilder::new("panel", WebviewUrl::External(child_url))
                .data_directory(app.path().app_local_data_dir()?.join("panel"));
            let panel = match mode.as_str() {
                "window" => {
                    let win = WindowBuilder::new(app, "insta")
                        .title("panel window")
                        .inner_size(PANEL_WIDTH as f64, h - TOP_BAR as f64)
                        .visible(open)
                        .build()?;
                    win.add_child(builder, origin, LogicalSize::new(PANEL_WIDTH as f64, h - TOP_BAR as f64))?
                }
                _ => window.add_child(
                    builder,
                    LogicalPosition::new(RAIL as f64, TOP_BAR as f64),
                    LogicalSize::new(PANEL_WIDTH as f64, h - TOP_BAR as f64),
                )?,
            };
            let view = webkit(&panel);
            tune(&view, "panel");
            match mode.as_str() {
                "child" if !open => panel.hide()?,
                "overlay" => {
                    let vbox = window.default_vbox()?;
                    let main_w: gtk::Widget = webkit(&main).upcast();
                    let child: gtk::Widget = view.clone().upcast();
                    vbox.remove(&main_w);
                    vbox.remove(&child);
                    let overlay = gtk::Overlay::new();
                    overlay.add(&main_w);
                    let revealer = gtk::Revealer::builder()
                        .transition_type(gtk::RevealerTransitionType::SlideRight)
                        .transition_duration(env("REVEAL_MS", "200").parse().unwrap())
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
                    revealer.set_reveal_child(open);
                    REVEALER.with(|r| *r.borrow_mut() = Some(revealer));
                }
                _ => {}
            }
            if env("GPU_DUMP", "0") == "1" {
                // innerText goes through the title: no JavaScriptCore binding needed.
                view.connect_title_notify(|v| println!("GPU_DUMP {}", v.title().unwrap_or_default()));
                view.connect_load_changed(|v, e| {
                    if e == webkit2gtk::LoadEvent::Finished {
                        v.evaluate_javascript(
                            "document.title = document.body.innerText.replace(/\\n/g, ' | ')",
                            None,
                            None,
                            None::<&gtk::gio::Cancellable>,
                            |_| {},
                        );
                    }
                });
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(secs));
                handle.exit(0);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
