use super::*;
use crate::claude::Claude;
use tauri::State;

/// Journal root `vaultPath/vaultProject` (the only place written to).
fn root(claude: &Claude) -> Result<PathBuf, String> {
    let s = claude.settings_get()?;
    let base = s.vault_path.ok_or(NOT_CONFIGURED)?;
    resolve_root(Path::new(&base), &s.vault_project)
}

/// Read root: the whole vault (`vaultPath`).
fn vault_root(claude: &Claude) -> Result<PathBuf, String> {
    let base = claude.settings_get()?.vault_path.ok_or(NOT_CONFIGURED)?;
    resolve_vault(Path::new(&base))
}

#[tauri::command]
pub fn vault_list(
    claude: State<'_, Claude>,
    folder: Option<String>,
) -> Result<VaultFolder, String> {
    list(&vault_root(&claude)?, folder.as_deref())
}

#[tauri::command]
pub fn vault_recent(claude: State<'_, Claude>, limit: usize) -> Result<Vec<VaultNote>, String> {
    recent(&vault_root(&claude)?, limit)
}

#[tauri::command]
pub fn vault_read(claude: State<'_, Claude>, path: String) -> Result<String, String> {
    read(&vault_root(&claude)?, &path)
}

#[tauri::command]
pub fn vault_search(claude: State<'_, Claude>, query: String) -> Result<Vec<VaultHit>, String> {
    search(&vault_root(&claude)?, &query)
}

#[tauri::command]
pub fn vault_open(claude: State<'_, Claude>, path: String) -> Result<(), String> {
    let s = claude.settings_get()?;
    let base = s.vault_path.ok_or(NOT_CONFIGURED)?;
    let name = Path::new(&base)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or("Chemin du vault invalide.")?;
    resolve(&resolve_vault(Path::new(&base))?, &path)?;
    crate::desktop::open_detached(&obsidian_url(&name, &path))
}

#[tauri::command]
pub fn vault_append_journal(claude: State<'_, Claude>, markdown: String) -> Result<(), String> {
    append_journal(&root(&claude)?, &markdown)
}
