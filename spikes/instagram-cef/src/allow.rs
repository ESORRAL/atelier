//! Same allowlist as `src-tauri/src/windows/mod.rs`, on plain strings (no `url` crate here).
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

/// Whether the browser may load `url`; `local` also admits the http://127.0.0.1 test server.
pub fn allowed(url: &str, local: bool) -> bool {
    if url == "about:blank" || (local && url.starts_with("http://127.0.0.1:")) {
        return true;
    }
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return false;
    }
    let host = authority
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    !EXTERNAL_HOSTS.contains(&host.as_str())
        && ALLOWED_DOMAINS
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn allowlist() {
        let ok = |s: &str| allowed(s, false);
        assert!(ok("https://www.instagram.com/reels/"));
        assert!(ok("https://scontent.cdninstagram.com/x.mp4"));
        assert!(ok("about:blank"));
        assert!(!ok("http://www.instagram.com/"));
        assert!(!ok("https://instagram.com.evil.example/"));
        assert!(!ok("https://evilinstagram.com/"));
        assert!(!ok("https://www.instagram.com@evil.example/"));
        assert!(!ok("https://l.facebook.com/l.php?u=x"));
        assert!(!ok("http://127.0.0.1:8000/a.html"));
        assert!(allowed("http://127.0.0.1:8000/a.html", true));
    }
}
