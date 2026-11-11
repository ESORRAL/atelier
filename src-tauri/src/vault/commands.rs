use super::*;
use crate::claude::Claude;
use tauri::State;

/// Resolves the vault project root from the settings, or fails with the "not configured" error.
fn root(claude: &Claude) -> Result<PathBuf, String> {
    let s = claude.settings_get()?;
    let base = s.vault_path.ok_or(NOT_CONFIGURED)?;
    resolve_root(Path::new(&base), &s.vault_project)
}

#[tauri::command]
pub fn vault_list(claude: State<'_, Claude>) -> Result<Vec<VaultNote>, String> {
    list(&root(&claude)?)
}

#[tauri::command]
pub fn vault_read(claude: State<'_, Claude>, path: String) -> Result<String, String> {
    read(&root(&claude)?, &path)
}

#[tauri::command]
pub fn vault_search(claude: State<'_, Claude>, query: String) -> Result<Vec<VaultHit>, String> {
    search(&root(&claude)?, &query)
}

#[tauri::command]
pub fn vault_open(claude: State<'_, Claude>, path: String) -> Result<(), String> {
    let s = claude.settings_get()?;
    let base = s.vault_path.ok_or(NOT_CONFIGURED)?;
    let name = Path::new(&base)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or("Chemin du vault invalide.")?;
    resolve(&resolve_root(Path::new(&base), &s.vault_project)?, &path)?;
    // The file part of the URL is relative to the vault, not to the project root.
    let file = format!("{}/{}", s.vault_project.trim_matches('/'), path);
    crate::desktop::open_detached(&obsidian_url(&name, &file))
}

#[tauri::command]
pub fn vault_append_journal(claude: State<'_, Claude>, markdown: String) -> Result<(), String> {
    append_journal(&root(&claude)?, &markdown)
}
