//! A picture copied to the system clipboard (contracts/ipc.md §8). WebKitGTK does not hand a copied screenshot to the
//! page's paste event, so the composer asks the core: GTK reads the clipboard itself, on the main thread.
use std::sync::mpsc;

use serde::Serialize;

const MAX_PNG: usize = 5 * 1024 * 1024; // what the API takes per picture

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImage {
    pub media_type: &'static str,
    pub data: String, // base64 of the PNG
    pub bytes: usize,
}

enum Clip {
    None,
    Text,
    Image(Vec<u8>),
}

fn read() -> Result<Clip, String> {
    let cb = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
    if cb.wait_is_text_available() {
        return Ok(Clip::Text); // text wins, as in a browser: a copied cell or page stays a text paste
    }
    match cb.wait_for_image() {
        None => Ok(Clip::None),
        Some(p) => p
            .save_to_bufferv("png", &[])
            .map(Clip::Image)
            .map_err(|_| "Image illisible.".to_string()),
    }
}

/// The picture on the clipboard, when there is one and no text; `None` otherwise. Called by the composer on a paste.
#[tauri::command]
pub async fn clipboard_image(app: tauri::AppHandle) -> Result<Option<ClipboardImage>, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(read());
    })
    .map_err(|e| e.to_string())?;
    match rx.recv().map_err(|e| e.to_string())?? {
        Clip::Image(png) if png.len() > MAX_PNG => Err("Image trop lourde (5 Mo au plus).".into()),
        Clip::Image(png) => Ok(Some(ClipboardImage {
            media_type: "image/png",
            bytes: png.len(),
            data: base64(&png),
        })),
        Clip::None | Clip::Text => Ok(None),
    }
}

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16
            | (*c.get(1).unwrap_or(&0) as u32) << 8
            | *c.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if c.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::base64;

    #[test]
    fn base64_matches_rfc_4648() {
        for (plain, coded) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(base64(plain.as_bytes()), coded);
        }
        assert_eq!(base64(&[0xff, 0xfe]), "//4=");
        assert_eq!(base64(&[0x89, b'P', b'N', b'G']), "iVBORw==");
    }
}
