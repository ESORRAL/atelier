//! Instagram panel inside the main window (contracts/ipc.md §15, spikes/instagram-panneau/FINDINGS.md).
//! A child webview of `main`, taken out of Tauri's GtkBox and put in a GtkOverlay + GtkRevealer that
//! slides in from the left, next to the rail. Same isolation as the window: no capability, no script.
//! Fragile by design: relies on tauri-runtime-wry packing child webviews in `default_vbox` (Tauri pinned).
use std::cell::RefCell;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;

use gtk::prelude::*;
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, Window, Wry};

use super::{START_URL, filter};
use crate::store::InstagramMode;

pub(crate) const PANEL_LABEL: &str = "instagram-panel";
const RAIL: i32 = 56;
const TOP_BAR: i32 = 56;
const PANEL_WIDTH: i32 = 420;
const SLIDE_MS: u32 = 200;

/// Set once the panel could not be installed: every later open uses the window.
static FAILED: AtomicBool = AtomicBool::new(false);
/// Serialises the first install, so two quick clicks cannot build the webview twice.
static INSTALL: Mutex<()> = Mutex::new(());

thread_local! {
    // GTK objects live on the main thread only.
    static REVEALER: RefCell<Option<gtk::Revealer>> = const { RefCell::new(None) };
}

#[derive(Debug, PartialEq)]
pub(crate) enum Target {
    Panel,
    Window,
}

/// Panel or separate window, from the setting and whether an install already failed.
pub(crate) fn target(mode: InstagramMode, failed: bool) -> Target {
    match mode {
        InstagramMode::Panel if !failed => Target::Panel,
        _ => Target::Window,
    }
}

/// The reparenting only works if Tauri packed both webviews directly in the window's box.
fn mountable<T: PartialEq>(children: &[T], main: &T, panel: &T) -> bool {
    children.contains(main) && children.contains(panel)
}

/// The WebKit widget behind a Tauri webview. Main thread only (with_webview is then synchronous).
fn gtk_widget(webview: &Webview) -> Option<gtk::Widget> {
    // gtk::Widget is not Send: hand it over through a main-thread slot instead of a channel.
    thread_local! {
        static SLOT: RefCell<Option<gtk::Widget>> = const { RefCell::new(None) };
    }
    webview
        .with_webview(|pw| SLOT.with(|s| *s.borrow_mut() = Some(pw.inner().upcast())))
        .ok()?;
    SLOT.with(|s| s.borrow_mut().take())
}

/// Builds the panel webview and reparents it. Main thread only. Nothing is moved unless both
/// webviews are found in the box, so a failure leaves `main` where Tauri put it.
fn install(app: &AppHandle) -> Result<(), String> {
    let window: Window<Wry> = app.get_window("main").ok_or("fenêtre principale absente")?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("instagram-panel");
    let url = START_URL.parse().map_err(|_| "URL de départ invalide.")?;
    let builder = WebviewBuilder::new(PANEL_LABEL, WebviewUrl::External(url))
        .data_directory(data_dir)
        .on_navigation(filter)
        .on_new_window(|url, _| {
            filter(&url);
            NewWindowResponse::Deny
        });
    // Bounds are irrelevant: the GtkOverlay lays the panel out.
    let panel = window
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(PANEL_WIDTH as f64, 1.0),
        )
        .map_err(|e| e.to_string())?;
    let res = reparent(&window, &panel);
    if res.is_err() {
        let _ = panel.close();
    }
    res
}

fn reparent(window: &Window<Wry>, panel: &Webview) -> Result<(), String> {
    let vbox = window.default_vbox().map_err(|e| e.to_string())?;
    let main_view = window
        .get_webview("main")
        .and_then(|w| gtk_widget(&w))
        .ok_or("webview principale introuvable")?;
    let child = gtk_widget(panel).ok_or("webview du panneau introuvable")?;
    if !mountable(&vbox.children(), &main_view, &child) {
        return Err("le GtkBox de la fenêtre ne contient pas les deux webviews".into());
    }
    vbox.remove(&main_view);
    vbox.remove(&child);

    let overlay = gtk::Overlay::new();
    overlay.add(&main_view);
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

    revealer.connect_reveal_child_notify(move |r| {
        let main_view = main_view.clone();
        r.add_tick_callback(move |r, _| {
            let done = r.is_child_revealed() == r.reveals_child();
            if done {
                // Without it, a strip of the closed panel stays unpainted on X11.
                main_view.queue_draw();
            }
            gtk::glib::ControlFlow::from(!done)
        });
    });
    REVEALER.with(|s| *s.borrow_mut() = Some(revealer));
    Ok(())
}

/// Slides the panel in or out, installing it on the first open. Err: the panel cannot be used.
fn show(app: &AppHandle, open: bool) -> Result<(), String> {
    let _guard = INSTALL.lock().map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let installed = REVEALER.with(|s| s.borrow().is_some());
        let res = if installed || !open {
            Ok(())
        } else {
            install(&handle)
        };
        REVEALER.with(|s| {
            if let Some(r) = s.borrow().as_ref() {
                r.set_reveal_child(open);
            }
        });
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())??;
    // Keyboard follows what the user sees.
    let label = if open { PANEL_LABEL } else { "main" };
    if let Some(w) = app.get_webview(label) {
        let _ = w.set_focus();
    }
    Ok(())
}

/// Opens or closes Instagram; returns where it went. See contracts/ipc.md §15.
pub(crate) async fn toggle(
    app: AppHandle,
    mode: InstagramMode,
    open: bool,
) -> Result<&'static str, String> {
    if target(mode, FAILED.load(Ordering::Relaxed)) == Target::Panel {
        match show(&app, open) {
            Ok(()) => return Ok("panel"),
            Err(e) => {
                eprintln!("[windows] panneau Instagram indisponible, repli sur la fenêtre : {e}");
                FAILED.store(true, Ordering::Relaxed);
            }
        }
    }
    if open {
        super::commands::pause_window_open(app).await?;
    }
    Ok("window")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panel_or_window() {
        assert_eq!(target(InstagramMode::Panel, false), Target::Panel);
        assert_eq!(target(InstagramMode::Panel, true), Target::Window);
        assert_eq!(target(InstagramMode::Window, false), Target::Window);
        assert_eq!(target(InstagramMode::Window, true), Target::Window);
    }

    #[test]
    fn mount_needs_both_webviews_in_the_box() {
        assert!(mountable(&[1, 2], &1, &2));
        assert!(mountable(&[3, 2, 1], &1, &2));
        assert!(!mountable(&[1], &1, &2));
        assert!(!mountable(&[2], &1, &2));
        assert!(!mountable::<i32>(&[], &1, &2));
    }
}
