//! Isolated "pause" pages (ADR-0003): the Instagram window (contracts/ipc.md §13) and the YouTube Shorts
//! panel (§15). No capability, no `remote` entry, no injected script: the pages cannot reach the app.
pub mod commands;
mod panel;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Url;

pub(crate) const LABEL: &str = "instagram";
pub(crate) const START_URL: &str = "https://www.instagram.com/";
// fbsbx.com hosts Meta's login captcha frame, which embeds Google reCAPTCHA (google.com, gstatic.com, recaptcha.net).
const ALLOWED_DOMAINS: &[&str] = &[
    "instagram.com",
    "cdninstagram.com",
    "facebook.com",
    "fbsbx.com",
    "google.com",
    "gstatic.com",
    "recaptcha.net",
];
// YouTube Shorts panel (§15): the site, its image/video hosts, Google sign-in and consent.
pub(crate) const SHORTS_DOMAINS: &[&str] = &[
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "ytimg.com",
    "googlevideo.com",
    "ggpht.com",
    "google.com",
    "gstatic.com",
];
// Open redirector: its target is arbitrary, so it leaves the window.
const EXTERNAL_HOSTS: &[&str] = &["l.facebook.com"];

/// Whether the Instagram window may load `url` itself.
pub fn allowed(url: &Url) -> bool {
    allowed_in(url, ALLOWED_DOMAINS)
}

/// Whether `url` is about:blank or an https page on one of `domains` (or a subdomain).
pub(crate) fn allowed_in(url: &Url, domains: &[&str]) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    url.scheme() == "https"
        && !EXTERNAL_HOSTS.contains(&host)
        && domains
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

const HANDOFF_GAP: Duration = Duration::from_secs(2);
static LAST_HANDOFF: Mutex<Option<Instant>> = Mutex::new(None);

/// Whether a handoff at `now` is allowed after the one at `last`; records it if so.
fn take_slot(last: &mut Option<Instant>, now: Instant) -> bool {
    if last.is_some_and(|t| now.duration_since(t) < HANDOFF_GAP) {
        return false;
    }
    *last = Some(now);
    true
}

/// Blocks a refused navigation and hands `https` links to the system browser,
/// at most once every 2 s: wry also calls this for iframes, server redirects and
/// scripted `location=` and does not say which, so a page could otherwise flood tabs.
pub(crate) fn filter(url: &Url) -> bool {
    if allowed(url) {
        return true;
    }
    if url.scheme() == "https" {
        let ok = LAST_HANDOFF
            .lock()
            .is_ok_and(|mut last| take_slot(&mut last, Instant::now()));
        if ok {
            let _ = crate::desktop::open_detached(url.as_str());
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist() {
        let ok = |s: &str| allowed(&s.parse().unwrap());
        assert!(ok("https://www.instagram.com/reels/"));
        assert!(ok("https://instagram.com/"));
        assert!(ok("https://scontent.cdninstagram.com/x.mp4"));
        assert!(ok("https://m.facebook.com/login"));
        assert!(ok("https://www.fbsbx.com/captcha/recaptcha/iframe/"));
        assert!(ok("https://www.recaptcha.net/x"));
        assert!(ok("about:blank"));
        assert!(!ok("about:srcdoc"));
        assert!(!ok("http://www.instagram.com/"));
        assert!(!ok("https://instagram.com.evil.example/"));
        assert!(!ok("https://evilinstagram.com/"));
        assert!(!ok("https://example.com/"));
        assert!(!ok(
            "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com"
        ));
        assert!(!ok("file:///etc/passwd"));
    }

    #[test]
    fn shorts_allowlist_is_separate() {
        let ok = |s: &str| allowed_in(&s.parse().unwrap(), SHORTS_DOMAINS);
        assert!(ok("https://www.youtube.com/shorts/abc"));
        assert!(ok("https://consent.youtube.com/m"));
        assert!(ok("https://accounts.google.com/ServiceLogin"));
        assert!(ok("https://i.ytimg.com/vi/x/hq.jpg"));
        assert!(ok("about:blank"));
        assert!(!ok("http://www.youtube.com/"));
        assert!(!ok("https://youtube.com.evil.example/"));
        assert!(!ok("https://googleads.g.doubleclick.net/x"));
        assert!(!ok("https://www.instagram.com/"));
        // And YouTube stays out of the Instagram window.
        assert!(!allowed(&"https://www.youtube.com/shorts".parse().unwrap()));
    }

    #[test]
    fn handoff_rate_limit() {
        let t0 = Instant::now();
        let mut last = None;
        assert!(take_slot(&mut last, t0));
        assert!(!take_slot(&mut last, t0 + Duration::from_millis(1999)));
        assert!(take_slot(&mut last, t0 + HANDOFF_GAP));
        assert!(!take_slot(&mut last, t0 + HANDOFF_GAP));
    }

    #[test]
    fn no_capability_reaches_instagram() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
        let mut seen = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|e| e == "json") {
                let text = std::fs::read_to_string(&path).unwrap();
                assert!(!text.contains(LABEL), "{path:?} cites {LABEL}");
                for site in panel::SITES {
                    assert!(
                        !text.contains(site.label()),
                        "{path:?} cites {}",
                        site.label()
                    );
                }
                assert!(!text.contains("remote"), "{path:?} has a remote entry");
                // A window target would also cover the panel webview living in `main` (§15).
                let cap: serde_json::Value = serde_json::from_str(&text).unwrap();
                assert!(cap.get("windows").is_none(), "{path:?} targets a window");
                assert_eq!(cap["webviews"], serde_json::json!(["main"]), "{path:?}");
                seen += 1;
            }
        }
        assert!(seen > 0, "no capability file found");
    }
}
