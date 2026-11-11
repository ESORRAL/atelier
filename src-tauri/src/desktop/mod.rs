//! Native desktop helpers: folder picker and Apple Music web launcher.
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use tauri_plugin_dialog::DialogExt;

const BASE: &str = "https://music.apple.com/";

/// Builds the Apple Music URL for a target. The UI never supplies a URL.
pub fn music_url(target: &str, query: Option<&str>) -> Result<String, String> {
    match target {
        "home" => Ok(BASE.into()),
        "library" => Ok(format!("{BASE}library")),
        "playlists" => Ok(format!("{BASE}library/playlists")),
        "search" => {
            let q = query.map(str::trim).unwrap_or("");
            let n = q.chars().count();
            if !(1..=200).contains(&n) {
                return Err("Le terme de recherche doit faire 1 à 200 caractères.".into());
            }
            Ok(format!("{BASE}search?term={}", encode(q)))
        }
        _ => Err("Destination Apple Music inconnue.".into()),
    }
}

/// Percent-encodes every byte outside the RFC 3986 unreserved set.
pub fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    picked
        .map(|p| {
            p.into_path()
                .map(|p| p.to_string_lossy().into_owned())
                .map_err(|_| "Dossier invalide.".to_string())
        })
        .transpose()
}

#[tauri::command]
pub fn music_open(target: String, query: Option<String>) -> Result<(), String> {
    open_detached(&music_url(&target, query.as_deref())?)
}

/// Opens a URL the caller has already validated with `xdg-open`.
pub fn open_detached(url: &str) -> Result<(), String> {
    // Exception to "every process goes through supervisor": xdg-open returns at once and the
    // launched browser must outlive Atelier, so it gets its own process group and is not tracked.
    let mut child = Command::new("xdg-open")
        .arg(url)
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "xdg-open est introuvable : impossible d'ouvrir le navigateur.".to_string())?;
    // Reap xdg-open without blocking the command.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_targets() {
        assert_eq!(music_url("home", None).unwrap(), "https://music.apple.com/");
        assert_eq!(
            music_url("library", None).unwrap(),
            "https://music.apple.com/library"
        );
        assert_eq!(
            music_url("playlists", None).unwrap(),
            "https://music.apple.com/library/playlists"
        );
        assert!(music_url("https://evil.test", None).is_err());
    }

    #[test]
    fn search_encoding() {
        let u = |q| music_url("search", Some(q)).unwrap();
        assert_eq!(
            u("daft punk"),
            "https://music.apple.com/search?term=daft%20punk"
        );
        assert_eq!(u("é"), "https://music.apple.com/search?term=%C3%A9");
        assert_eq!(
            u("a&b=c#d"),
            "https://music.apple.com/search?term=a%26b%3Dc%23d"
        );
    }

    #[test]
    fn search_validation() {
        assert!(music_url("search", None).is_err());
        assert!(music_url("search", Some("")).is_err());
        assert!(music_url("search", Some("   ")).is_err());
        assert!(music_url("search", Some(&"a".repeat(200))).is_ok());
        assert!(music_url("search", Some(&"a".repeat(201))).is_err());
    }
}
