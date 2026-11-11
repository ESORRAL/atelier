//! Module `vault`: see contracts/ipc.md §10. Read-only, except the journal insertion.
pub mod commands;

use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

pub const NOT_CONFIGURED: &str = "Vault Obsidian non configuré";
const MAX_FILE: u64 = 1024 * 1024;
const MAX_FILES: usize = 500;
const MAX_HITS: usize = 50;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct VaultNote {
    pub path: String,
    pub title: String,
    pub modified: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct VaultHit {
    pub path: String,
    pub title: String,
    pub line: usize,
    pub excerpt: String,
}

/// Canonical project root `base/project`; errors when unset or missing.
pub fn resolve_root(base: &Path, project: &str) -> Result<PathBuf, String> {
    if project.split('/').any(|c| c == "..") || project.starts_with('/') {
        return Err("Dossier de projet du vault invalide.".into());
    }
    fs::canonicalize(base.join(project)).map_err(|_| NOT_CONFIGURED.to_string())
}

/// Validates a note path: relative, `.md`, no `..`, and once resolved (symlinks followed) still
/// under the canonical `root`. Returns the canonical path.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let bad = || "Chemin de note invalide.".to_string();
    let p = Path::new(rel);
    if p.is_absolute() || p.extension().is_none_or(|e| e != "md") {
        return Err(bad());
    }
    if !p.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(bad());
    }
    let full = fs::canonicalize(root.join(p)).map_err(|_| "Note introuvable.".to_string())?;
    if !full.starts_with(root) {
        return Err(bad());
    }
    Ok(full)
}

fn read_capped(path: &Path) -> Result<String, String> {
    let f = fs::File::open(path).map_err(|_| "Lecture impossible.".to_string())?;
    let mut buf = Vec::new();
    f.take(MAX_FILE + 1)
        .read_to_end(&mut buf)
        .map_err(|_| "Lecture impossible.".to_string())?;
    if buf.len() as u64 > MAX_FILE {
        return Err("Note trop volumineuse (1 Mio au plus).".into());
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

pub fn read(root: &Path, rel: &str) -> Result<String, String> {
    read_capped(&resolve(root, rel)?)
}

/// `.md` files under `root` as (relative path, modified ms), most recent first, 500 at most.
/// Symlinks are not followed.
fn walk(root: &Path) -> Vec<(String, u64)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            let p = e.path();
            if ft.is_dir() {
                stack.push(p);
            } else if ft.is_file() && p.extension().is_some_and(|x| x == "md") {
                let Ok(md) = e.metadata() else { continue };
                let ms = md
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_millis() as u64);
                if let Ok(r) = p.strip_prefix(root) {
                    out.push((r.to_string_lossy().into_owned(), ms));
                }
            }
        }
    }
    out.sort_by_key(|(_, m)| std::cmp::Reverse(*m));
    out.truncate(MAX_FILES);
    out
}

fn title_of(rel: &str, text: &str) -> String {
    text.lines()
        .find_map(|l| l.strip_prefix("# "))
        .map(|t| t.trim().to_string())
        .unwrap_or_else(|| {
            Path::new(rel)
                .file_stem()
                .map_or(String::new(), |s| s.to_string_lossy().into_owned())
        })
}

pub fn list(root: &Path) -> Result<Vec<VaultNote>, String> {
    Ok(walk(root)
        .into_iter()
        .map(|(path, modified)| {
            let text = read_capped(&root.join(&path)).unwrap_or_default();
            VaultNote {
                title: title_of(&path, &text),
                path,
                modified,
            }
        })
        .collect())
}

/// Lowercase and strip common Latin accents; one output char per input char (keeps offsets).
fn fold(s: &str) -> Vec<char> {
    s.chars()
        .map(|c| {
            let c = c.to_lowercase().next().unwrap_or(c);
            match c {
                'à'..='å' => 'a',
                'ç' => 'c',
                'è'..='ë' => 'e',
                'ì'..='ï' => 'i',
                'ñ' => 'n',
                'ò'..='ö' => 'o',
                'ù'..='ü' => 'u',
                'ý' | 'ÿ' => 'y',
                _ => c,
            }
        })
        .collect()
}

fn find(hay: &[char], needle: &[char]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

/// At most 160 chars of `line`, starting up to 60 chars before the match.
fn excerpt(line: &str, at: usize) -> String {
    line.chars()
        .skip(at.saturating_sub(60))
        .take(160)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn search(root: &Path, query: &str) -> Result<Vec<VaultHit>, String> {
    let n = query.chars().count();
    if !(2..=100).contains(&n) {
        return Err("La recherche doit faire de 2 à 100 caractères.".into());
    }
    let needle = fold(query);
    let mut hits = Vec::new();
    for (path, _) in walk(root) {
        let Ok(text) = read_capped(&root.join(&path)) else {
            continue;
        };
        // First occurrence per note.
        if let Some((i, at)) = text
            .lines()
            .enumerate()
            .find_map(|(i, l)| find(&fold(l), &needle).map(|at| (i, at)))
        {
            hits.push(VaultHit {
                title: title_of(&path, &text),
                line: i + 1,
                excerpt: excerpt(text.lines().nth(i).unwrap_or(""), at),
                path,
            });
        }
        if hits.len() >= MAX_HITS {
            break;
        }
    }
    Ok(hits)
}

pub fn obsidian_url(vault: &str, file: &str) -> String {
    use crate::desktop::encode;
    format!(
        "obsidian://open?vault={}&file={}",
        encode(vault),
        encode(file)
    )
}

/// Inserts `block` right after the first `# ` line of `Journal.md` (or at the top), atomically.
pub fn append_journal(root: &Path, block: &str) -> Result<(), String> {
    let n = block.chars().count();
    if !(1..=20_000).contains(&n) {
        return Err("Le récap doit faire de 1 à 20 000 caractères.".into());
    }
    let path = root.join("Journal.md");
    let old = if path.exists() {
        read_capped(&path)?
    } else {
        String::new()
    };
    let block = block.trim_end();
    let lines: Vec<&str> = old.split_inclusive('\n').collect();
    let new = match lines.iter().position(|l| l.starts_with("# ")) {
        Some(i) => {
            let head: String = lines[..=i].concat();
            let rest: String = lines[i + 1..].concat();
            let nl = if head.ends_with('\n') { "" } else { "\n" };
            let sep = if rest.is_empty() { "" } else { "\n" };
            format!("{head}{nl}\n{block}\n{sep}{rest}")
        }
        None if old.is_empty() => format!("{block}\n"),
        None => format!("{block}\n\n{old}"),
    };
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let io = |_| "Écriture du journal impossible.".to_string();
    let mut f = fs::File::create(&tmp).map_err(io)?;
    f.write_all(new.as_bytes()).map_err(io)?;
    f.sync_all().map_err(io)?;
    fs::rename(&tmp, &path).map_err(io)
}

#[cfg(test)]
mod tests;
