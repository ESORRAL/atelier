//! "Pause" panels inside the main window: YouTube Shorts and Instagram (contracts/ipc.md §15 ter,
//! spikes/instagram-panneau/FINDINGS.md). Each one is a child webview of `main`, taken out of Tauri's
//! GtkBox and put in a GtkRevealer over the main webview (one shared GtkOverlay); it slides in from the
//! left, next to the rail. Only one is shown at a time. Same isolation as the window: no capability,
//! no script, own data directory, own navigation allowlist.
//! Fragile by design: relies on tauri-runtime-wry packing child webviews in `default_vbox` (Tauri pinned).
use std::cell::RefCell;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use gtk::prelude::*;
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl, Window, Wry,
};
use webkit2gtk::WebViewExt;

use super::{SHORTS_DOMAINS, allowed_in, filter};

const RAIL: i32 = 56;
const TOP_BAR: i32 = 56;
const PANEL_WIDTH: i32 = 420;
const SLIDE_MS: u32 = 200;
/// A hidden video page keeps its WebAudio graphs and media pipelines running (about 25 % CPU,
/// 700 MB, spikes/instagram-perf/FINDINGS.md): past this delay closed, it is swapped for about:blank.
const UNLOAD_AFTER: Duration = Duration::from_secs(120);
const BLANK: &str = "about:blank";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Site {
    Shorts,
    Instagram,
}

pub(crate) const SITES: [Site; 2] = [Site::Shorts, Site::Instagram];

impl Site {
    pub(crate) fn parse(s: &str) -> Option<Site> {
        match s {
            "shorts" => Some(Site::Shorts),
            "instagram" => Some(Site::Instagram),
            _ => None,
        }
    }
    fn index(self) -> usize {
        self as usize
    }
    pub(crate) fn label(self) -> &'static str {
        match self {
            Site::Shorts => "shorts-panel",
            // Same name as the former single panel: its data directory keeps the Instagram sign-in.
            Site::Instagram => "instagram-panel",
        }
    }
    fn start(self) -> &'static str {
        match self {
            Site::Shorts => "https://www.youtube.com/shorts",
            Site::Instagram => super::START_URL,
        }
    }
    /// Whether the panel may load `url`.
    fn navigate(self, url: &Url) -> bool {
        match self {
            // Off-list loads are dropped silently, not handed to the browser: wry reports iframes too,
            // and YouTube's ad and tracking frames would otherwise open tabs.
            Site::Shorts => allowed_in(url, SHORTS_DOMAINS),
            // Instagram links to other sites go to the system browser (rate-limited), as in the window.
            Site::Instagram => filter(url),
        }
    }
}

/// Per-site state, indexed by `Site::index`.
struct State {
    /// Set once the panel could not be installed: every later open uses the fallback.
    failed: AtomicBool,
    /// Bumped on every open or close: a pending unload only runs if nothing happened since.
    generation: AtomicU64,
    /// Page shown before the unload, restored on the next open.
    unloaded: Mutex<Option<Url>>,
}

static STATE: [State; 2] = [const {
    State {
        failed: AtomicBool::new(false),
        generation: AtomicU64::new(0),
        unloaded: Mutex::new(None),
    }
}; 2];
/// Serialises installs, so two quick clicks cannot build a webview twice.
static INSTALL: Mutex<()> = Mutex::new(());

thread_local! {
    // GTK objects live on the main thread only.
    static OVERLAY: RefCell<Option<gtk::Overlay>> = const { RefCell::new(None) };
    static REVEALERS: RefCell<[Option<gtk::Revealer>; 2]> = const { RefCell::new([None, None]) };
}

/// The reparenting needs the panel webview packed directly in the window's box, and, the first time,
/// the main webview too (later it already sits in the overlay).
fn mountable<T: PartialEq>(children: &[T], main: Option<&T>, panel: &T) -> bool {
    children.contains(panel) && main.is_none_or(|m| children.contains(m))
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

/// Builds the panel webview and reparents it. Main thread only. Nothing is moved unless the check
/// passes, so a failure leaves `main` where it was.
fn install(app: &AppHandle, site: Site) -> Result<(), String> {
    let window: Window<Wry> = app.get_window("main").ok_or("fenêtre principale absente")?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(site.label());
    let url = site
        .start()
        .parse()
        .map_err(|_| "URL de départ invalide.")?;
    let builder = WebviewBuilder::new(site.label(), WebviewUrl::External(url))
        .data_directory(data_dir)
        .on_navigation(move |url| {
            let ok = site.navigate(url);
            if !ok && cfg!(debug_assertions) {
                // Host only, never the path: helps find a domain a sign-in needs.
                eprintln!(
                    "[panel {}] bloqué : {}",
                    site.label(),
                    url.host_str().unwrap_or(url.scheme())
                );
            }
            ok
        })
        .on_new_window(move |url, _| {
            if site == Site::Instagram {
                filter(&url);
            }
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
    let res = reparent(&window, &panel, site);
    if res.is_err() {
        let _ = panel.close();
    }
    res
}

fn reparent(window: &Window<Wry>, panel: &Webview, site: Site) -> Result<(), String> {
    let vbox = window.default_vbox().map_err(|e| e.to_string())?;
    let child = gtk_widget(panel).ok_or("webview du panneau introuvable")?;
    let overlay = match OVERLAY.with(|o| o.borrow().clone()) {
        Some(overlay) => {
            if !mountable(&vbox.children(), None, &child) {
                return Err("le GtkBox de la fenêtre ne contient pas la webview du panneau".into());
            }
            vbox.remove(&child);
            overlay
        }
        None => {
            let main_view = window
                .get_webview("main")
                .and_then(|w| gtk_widget(&w))
                .ok_or("webview principale introuvable")?;
            if !mountable(&vbox.children(), Some(&main_view), &child) {
                return Err("le GtkBox de la fenêtre ne contient pas les deux webviews".into());
            }
            vbox.remove(&main_view);
            vbox.remove(&child);
            let overlay = gtk::Overlay::new();
            overlay.add(&main_view);
            vbox.pack_start(&overlay, true, true, 0);
            OVERLAY.with(|o| *o.borrow_mut() = Some(overlay.clone()));
            overlay
        }
    };

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
    overlay.show_all();

    let main_view = overlay.child();
    revealer.connect_reveal_child_notify(move |r| {
        let main_view = main_view.clone();
        r.add_tick_callback(move |r, _| {
            let done = r.is_child_revealed() == r.reveals_child();
            if done && let Some(m) = &main_view {
                // Without it, a strip of the closed panel stays unpainted on X11.
                m.queue_draw();
            }
            gtk::glib::ControlFlow::from(!done)
        });
    });
    REVEALERS.with(|r| r.borrow_mut()[site.index()] = Some(revealer));
    Ok(())
}

/// Slides `site` in or out (any other panel out), installing it on its first open.
/// Err: the panel cannot be used.
fn show(app: &AppHandle, site: Site, open: bool) -> Result<(), String> {
    let _guard = INSTALL.lock().map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let installed = REVEALERS.with(|r| r.borrow()[site.index()].is_some());
        let res = if installed || !open {
            Ok(())
        } else {
            install(&handle, site)
        };
        REVEALERS.with(|r| {
            for (i, rev) in r.borrow().iter().enumerate() {
                if let Some(rev) = rev {
                    let shown = open && i == site.index();
                    rev.set_reveal_child(shown);
                    // A hidden page keeps playing (WebKitGTK does not pause it): silence it natively,
                    // no script in the page. The unload below stops it for good after UNLOAD_AFTER.
                    if let Some(view) = rev
                        .child()
                        .and_then(|c| c.downcast::<webkit2gtk::WebView>().ok())
                    {
                        view.set_is_muted(!shown);
                    }
                }
            }
        });
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())??;
    // Keyboard follows what the user sees.
    let label = if open { site.label() } else { "main" };
    if let Some(w) = app.get_webview(label) {
        let _ = w.set_focus();
    }
    Ok(())
}

/// Where to go on open: the page saved by the unload (else the start page), if the panel is blank.
fn resume_url(current: &Url, saved: Option<Url>, start: &str) -> Option<Url> {
    if current.as_str() != BLANK {
        return None;
    }
    saved.or_else(|| start.parse().ok())
}

/// After a close: unload the page once the panel stayed closed for `UNLOAD_AFTER`.
fn schedule_unload(app: AppHandle, site: Site) {
    let state = &STATE[site.index()];
    let generation = state.generation.fetch_add(1, Ordering::Relaxed) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(UNLOAD_AFTER).await;
        // The lock makes check + navigate + save one step against `resume`, which bumps the
        // generation first and then waits on this lock: a reopen can never be blanked afterwards.
        let Ok(mut saved) = state.unloaded.lock() else {
            return;
        };
        if state.generation.load(Ordering::Relaxed) != generation {
            return;
        }
        let Some(w) = app.get_webview(site.label()) else {
            return;
        };
        let (Ok(url), Ok(blank)) = (w.url(), BLANK.parse()) else {
            return;
        };
        if url.as_str() != BLANK && w.navigate(blank).is_ok() {
            *saved = Some(url);
        }
    });
}

/// Before an open: cancel a pending unload and reload the page if it was unloaded.
fn resume(app: &AppHandle, site: Site) {
    let state = &STATE[site.index()];
    state.generation.fetch_add(1, Ordering::Relaxed);
    let Some(w) = app.get_webview(site.label()) else {
        return;
    };
    let saved = state.unloaded.lock().ok().and_then(|mut s| s.take());
    if let Some(url) = w
        .url()
        .ok()
        .and_then(|u| resume_url(&u, saved, site.start()))
    {
        let _ = w.navigate(url);
    }
}

/// Opens or closes a panel; returns where it went. See contracts/ipc.md §15 ter.
pub(crate) async fn toggle(app: AppHandle, site: Site, open: bool) -> Result<&'static str, String> {
    let state = &STATE[site.index()];
    if !state.failed.load(Ordering::Relaxed) {
        if open {
            resume(&app, site);
        }
        match show(&app, site, open) {
            Ok(()) => {
                if open {
                    // The other panel slid out: let it unload too.
                    for other in SITES.into_iter().filter(|s| *s != site) {
                        schedule_unload(app.clone(), other);
                    }
                } else {
                    schedule_unload(app, site);
                }
                return Ok("panel");
            }
            // A failed close is not a failed install: keep the panel mode for the next open.
            Err(e) if !open => {
                eprintln!("[windows] fermeture du panneau {} : {e}", site.label());
                return Ok("panel");
            }
            Err(e) => {
                eprintln!(
                    "[windows] panneau {} indisponible, repli : {e}",
                    site.label()
                );
                state.failed.store(true, Ordering::Relaxed);
            }
        }
    }
    if !open {
        return Ok("panel");
    }
    match site {
        Site::Shorts => {
            super::commands::pause_open_browser("shorts".into())?;
            Ok("browser")
        }
        Site::Instagram => {
            super::commands::pause_window_open(app).await?;
            Ok("window")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sites() {
        assert_eq!(Site::parse("shorts"), Some(Site::Shorts));
        assert_eq!(Site::parse("instagram"), Some(Site::Instagram));
        assert_eq!(Site::parse("main"), None);
        assert_ne!(Site::Shorts.label(), Site::Instagram.label());
        assert!(
            SITES
                .iter()
                .all(|s| s.label() != "main" && s.label() != super::super::LABEL)
        );
        // Each panel keeps to its own sites.
        let yt: Url = "https://www.youtube.com/shorts".parse().unwrap();
        assert!(Site::Shorts.navigate(&yt));
        let ig: Url = "https://www.instagram.com/direct/inbox/".parse().unwrap();
        assert!(Site::Instagram.navigate(&ig));
        assert!(!Site::Shorts.navigate(&ig));
    }

    #[test]
    fn resume_only_a_blank_panel() {
        let blank: Url = BLANK.parse().unwrap();
        let reel: Url = "https://www.youtube.com/shorts/x".parse().unwrap();
        let start = "https://www.youtube.com/shorts";
        assert_eq!(
            resume_url(&blank, Some(reel.clone()), start),
            Some(reel.clone())
        );
        assert_eq!(
            resume_url(&blank, None, start),
            Some(start.parse().unwrap())
        );
        // The user navigated since: keep the page.
        assert_eq!(resume_url(&reel, Some(reel.clone()), start), None);
    }

    #[test]
    fn mount_checks() {
        // First panel: both webviews must be in the box.
        assert!(mountable(&[1, 2], Some(&1), &2));
        assert!(mountable(&[3, 2, 1], Some(&1), &2));
        assert!(!mountable(&[1], Some(&1), &2));
        assert!(!mountable(&[2], Some(&1), &2));
        // Later panels: main already sits in the overlay.
        assert!(mountable(&[2], None, &2));
        assert!(!mountable::<i32>(&[], None, &2));
    }
}
