//! Apple catalog search through the public iTunes Search API (contracts/ipc.md §9).
//! Nothing in Apple's response is trusted: every URL goes through a host allow-list.

use std::sync::OnceLock;
use std::time::Duration;

use reqwest::Url;
use serde::Serialize;
use serde_json::Value;

use crate::desktop::{encode, open_detached};

const API: &str = "https://itunes.apple.com";
const OFFLINE: &str = "Pas de connexion à Apple Music.";

const PAGE_HOSTS: &[&str] = &["music.apple.com", "itunes.apple.com"];
const ARTWORK_HOSTS: &[&str] = &["*.mzstatic.com"];
const PREVIEW_HOSTS: &[&str] = &["audio-ssl.itunes.apple.com", "*.mzstatic.com"];

#[derive(Debug, Serialize, PartialEq)]
pub struct MusicArtist {
    pub id: u64,
    pub name: String,
    pub genre: Option<String>,
    pub url: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicAlbum {
    pub id: u64,
    pub name: String,
    pub artist: String,
    pub artwork_url: Option<String>,
    pub year: Option<u32>,
    pub track_count: Option<u32>,
    pub url: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicSong {
    pub id: u64,
    pub name: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork_url: Option<String>,
    pub duration_ms: Option<u64>,
    pub preview_url: Option<String>,
    pub url: String,
}

#[derive(Debug, Serialize, PartialEq, Default)]
pub struct SearchResults {
    pub artists: Vec<MusicArtist>,
    pub albums: Vec<MusicAlbum>,
    pub songs: Vec<MusicSong>,
}

/// Returns the normalized URL if it is `https` on one of `hosts` (`*.x` matches subdomains of x).
pub fn allowed(url: &str, hosts: &[&str]) -> Option<String> {
    let u = Url::parse(url).ok()?;
    if u.scheme() != "https" || !u.username().is_empty() || u.password().is_some() {
        return None;
    }
    if u.port().is_some() {
        return None;
    }
    let host = u.host_str()?;
    let ok = hosts.iter().any(|h| match h.strip_prefix("*.") {
        Some(domain) => host
            .strip_suffix(domain)
            .is_some_and(|sub| sub.len() > 1 && sub.ends_with('.')),
        None => host == *h,
    });
    ok.then(|| u.to_string())
}

fn entity(kind: &str) -> Result<&'static str, String> {
    match kind {
        "artist" => Ok("musicArtist"),
        "album" => Ok("album"),
        "song" => Ok("song"),
        _ => Err(format!("Type de recherche inconnu : « {kind} ».")),
    }
}

pub fn check_term(term: &str) -> Result<&str, String> {
    let t = term.trim();
    if (1..=200).contains(&t.chars().count()) {
        Ok(t)
    } else {
        Err("Le terme de recherche doit faire 1 à 200 caractères.".into())
    }
}

pub fn search_url(term: &str, entity: &str, limit: u32) -> String {
    format!(
        "{API}/search?term={}&entity={entity}&limit={limit}&country=fr",
        encode(term)
    )
}

pub fn lookup_url(id: u64, entity: &str) -> String {
    format!("{API}/lookup?id={id}&entity={entity}&country=fr")
}

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn page(v: &Value, key: &str) -> Option<String> {
    allowed(v.get(key)?.as_str()?, PAGE_HOSTS)
}

/// Apple serves `.../100x100bb.jpg`; the size lives in the last path segment.
fn artwork(v: &Value) -> Option<String> {
    let raw = v.get("artworkUrl100")?.as_str()?;
    let i = raw.rfind("100x100")?;
    allowed(
        &format!("{}200x200{}", &raw[..i], &raw[i + 7..]),
        ARTWORK_HOSTS,
    )
}

fn artist(v: &Value) -> Option<MusicArtist> {
    Some(MusicArtist {
        id: v.get("artistId")?.as_u64()?,
        name: text(v, "artistName")?,
        genre: text(v, "primaryGenreName"),
        url: page(v, "artistLinkUrl")?,
    })
}

fn album(v: &Value) -> Option<MusicAlbum> {
    Some(MusicAlbum {
        id: v.get("collectionId")?.as_u64()?,
        name: text(v, "collectionName")?,
        artist: text(v, "artistName").unwrap_or_default(),
        artwork_url: artwork(v),
        year: text(v, "releaseDate").and_then(|d| d.get(..4)?.parse().ok()),
        track_count: v
            .get("trackCount")
            .and_then(Value::as_u64)
            .and_then(|n| n.try_into().ok()),
        url: page(v, "collectionViewUrl")?,
    })
}

fn song(v: &Value) -> Option<MusicSong> {
    Some(MusicSong {
        id: v.get("trackId")?.as_u64()?,
        name: text(v, "trackName")?,
        artist: text(v, "artistName").unwrap_or_default(),
        album: text(v, "collectionName"),
        artwork_url: artwork(v),
        duration_ms: v.get("trackTimeMillis").and_then(Value::as_u64),
        preview_url: v
            .get("previewUrl")
            .and_then(Value::as_str)
            .and_then(|u| allowed(u, PREVIEW_HOSTS)),
        url: page(v, "trackViewUrl")?,
    })
}

/// Sorts an API `results` array into the three lists; elements without a valid id, name or
/// page URL are dropped. `skip` drops leading entries (the looked-up entity itself).
pub fn extract(body: &Value, skip: usize, into: &mut SearchResults) {
    let Some(items) = body.get("results").and_then(Value::as_array) else {
        return;
    };
    for v in items.iter().skip(skip) {
        match v.get("wrapperType").and_then(Value::as_str) {
            Some("artist") => into.artists.extend(artist(v)),
            Some("collection") => into.albums.extend(album(v)),
            Some("track") if v.get("kind").and_then(Value::as_str) == Some("song") => {
                into.songs.extend(song(v))
            }
            _ => {}
        }
    }
}

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let policy = reqwest::redirect::Policy::custom(|a| {
        if a.previous().len() < 5 && allowed(a.url().as_str(), &["itunes.apple.com"]).is_some() {
            a.follow()
        } else {
            a.stop()
        }
    });
    let c = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(policy)
        .build()
        .map_err(|_| "Client HTTP indisponible.".to_string())?;
    Ok(CLIENT.get_or_init(|| c))
}

/// Largest Apple response we accept; a search page is a few hundred KiB at most.
const MAX_BODY: usize = 2 * 1024 * 1024;
const TOO_BIG: &str = "Réponse trop volumineuse d'Apple Music.";

/// Appends `chunk` to `buf`, refusing to grow past `cap` bytes.
fn push_capped(buf: &mut Vec<u8>, chunk: &[u8], cap: usize) -> Result<(), String> {
    if buf.len() + chunk.len() > cap {
        return Err(TOO_BIG.into());
    }
    buf.extend_from_slice(chunk);
    Ok(())
}

async fn fetch(url: String) -> Result<Value, String> {
    let mut res = client()?.get(url).send().await.map_err(|_| OFFLINE)?;
    if !res.status().is_success() {
        return Err(format!(
            "Apple Music a répondu par une erreur ({}).",
            res.status().as_u16()
        ));
    }
    if res.content_length().is_some_and(|n| n > MAX_BODY as u64) {
        return Err(TOO_BIG.into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|_| OFFLINE)? {
        push_capped(&mut body, &chunk, MAX_BODY)?;
    }
    serde_json::from_slice(&body).map_err(|_| "Réponse d'Apple Music illisible.".into())
}

#[tauri::command]
pub async fn music_search(term: String, kind: String) -> Result<SearchResults, String> {
    let term = check_term(&term)?;
    let mut out = SearchResults::default();
    if kind == "all" {
        let (a, b, c) = tokio::join!(
            fetch(search_url(term, "musicArtist", 5)),
            fetch(search_url(term, "album", 10)),
            fetch(search_url(term, "song", 15)),
        );
        for body in [a?, b?, c?] {
            extract(&body, 0, &mut out);
        }
    } else {
        extract(
            &fetch(search_url(term, entity(&kind)?, 25)).await?,
            0,
            &mut out,
        );
    }
    Ok(out)
}

#[tauri::command]
pub async fn music_lookup(id: u64, what: String) -> Result<SearchResults, String> {
    let entity = match what.as_str() {
        "artist_albums" => "album",
        "album_songs" => "song",
        _ => return Err(format!("Recherche inconnue : « {what} ».")),
    };
    let mut out = SearchResults::default();
    // The first result is the artist or album that was looked up.
    extract(&fetch(lookup_url(id, entity)).await?, 1, &mut out);
    Ok(out)
}

#[tauri::command]
pub fn music_open_url(url: String) -> Result<(), String> {
    let url = allowed(&url, PAGE_HOSTS)
        .ok_or("Seules les adresses https de music.apple.com ou itunes.apple.com s'ouvrent.")?;
    open_detached(&url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn body_is_capped() {
        let fill = |chunks: &[&[u8]]| {
            let mut buf = Vec::new();
            chunks
                .iter()
                .try_for_each(|c| push_capped(&mut buf, c, 4))
                .map(|_| buf)
        };
        assert_eq!(fill(&[b"ab", b"cd"]), Ok(b"abcd".to_vec()));
        assert_eq!(fill(&[b"ab", b"cd", b"e"]), Err(TOO_BIG.to_string()));
        assert_eq!(fill(&[b"abcde"]), Err(TOO_BIG.to_string()));
    }

    #[test]
    fn url_building_encodes_term() {
        assert_eq!(
            search_url("café crème & #1", "song", 15),
            "https://itunes.apple.com/search?term=caf%C3%A9%20cr%C3%A8me%20%26%20%231&entity=song&limit=15&country=fr"
        );
        assert_eq!(
            lookup_url(42, "album"),
            "https://itunes.apple.com/lookup?id=42&entity=album&country=fr"
        );
        assert!(check_term("  ").is_err() && check_term(&"é".repeat(201)).is_err());
        assert_eq!(check_term(" x "), Ok("x"));
        assert!(entity("video").is_err());
    }

    #[test]
    fn host_allow_list() {
        let ok = |u| allowed(u, PAGE_HOSTS).is_some();
        assert!(ok("https://music.apple.com/fr/album/x/1"));
        assert!(ok("https://itunes.apple.com/fr/x"));
        for bad in [
            "https://evil.example/",
            "https://music.apple.com.evil.example/",
            "https://music.apple.com@evil.example/",
            "https://music.apple.com:8443/",
            "http://music.apple.com/",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "music.apple.com",
        ] {
            assert!(!ok(bad), "{bad}");
        }
        let art = |u| allowed(u, ARTWORK_HOSTS).is_some();
        assert!(art("https://is1-ssl.mzstatic.com/a.jpg"));
        assert!(!art("https://mzstatic.com/a.jpg"));
        assert!(!art("https://evilmzstatic.com/a.jpg"));
        assert!(!art("https://is1.mzstatic.com.evil.example/a.jpg"));
    }

    #[test]
    fn extraction() {
        let body = json!({ "results": [
            { "wrapperType": "artist", "artistId": 1, "artistName": "Daft Punk",
              "primaryGenreName": "Électronique",
              "artistLinkUrl": "https://music.apple.com/fr/artist/daft-punk/1?uo=4" },
            { "wrapperType": "collection", "collectionId": 2, "collectionName": "Discovery",
              "artistName": "Daft Punk", "trackCount": 14, "releaseDate": "2001-03-12T08:00:00Z",
              "artworkUrl100": "https://is1-ssl.mzstatic.com/image/x/100x100bb.jpg",
              "collectionViewUrl": "https://music.apple.com/fr/album/discovery/2" },
            { "wrapperType": "track", "kind": "song", "trackId": 3, "trackName": "One More Time",
              "artistName": "Daft Punk",
              "artworkUrl100": "https://evil.example/100x100bb.jpg",
              "trackViewUrl": "https://music.apple.com/fr/song/3" },
            { "wrapperType": "track", "kind": "song", "trackId": 4, "trackName": "No page",
              "trackViewUrl": "javascript:alert(1)" },
            { "wrapperType": "track", "kind": "music-video", "trackId": 5, "trackName": "Clip",
              "trackViewUrl": "https://music.apple.com/fr/v/5" }
        ]});
        let mut r = SearchResults::default();
        extract(&body, 0, &mut r);
        assert_eq!(
            r.artists,
            vec![MusicArtist {
                id: 1,
                name: "Daft Punk".into(),
                genre: Some("Électronique".into()),
                url: "https://music.apple.com/fr/artist/daft-punk/1?uo=4".into(),
            }]
        );
        let a = &r.albums[0];
        assert_eq!(
            a.artwork_url.as_deref(),
            Some("https://is1-ssl.mzstatic.com/image/x/200x200bb.jpg")
        );
        assert_eq!((a.year, a.track_count), (Some(2001), Some(14)));
        assert_eq!(r.songs.len(), 1);
        let s = &r.songs[0];
        assert_eq!(
            (s.artwork_url.as_ref(), s.preview_url.as_ref()),
            (None, None)
        );
        assert_eq!((s.album.as_ref(), s.duration_ms), (None, None));
        let json = serde_json::to_value(s).unwrap();
        assert!(json.get("previewUrl").unwrap().is_null() && json.get("durationMs").is_some());

        let mut r = SearchResults::default();
        extract(&body, 1, &mut r);
        assert!(r.artists.is_empty() && r.albums.len() == 1);
        extract(&json!({}), 0, &mut r);
    }

    #[test]
    #[ignore = "network: hits itunes.apple.com"]
    fn live_search_and_lookup() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let r = rt
            .block_on(music_search("daft punk".into(), "all".into()))
            .unwrap();
        println!(
            "{} artists, {} albums, {} songs; first song: {:?}",
            r.artists.len(),
            r.albums.len(),
            r.songs.len(),
            r.songs.first()
        );
        let id = r.albums[0].id;
        let l = rt.block_on(music_lookup(id, "album_songs".into())).unwrap();
        println!(
            "album {id}: {} songs, first {:?}",
            l.songs.len(),
            l.songs.first()
        );
        assert!(!r.songs.is_empty() && !l.songs.is_empty());
    }
}
