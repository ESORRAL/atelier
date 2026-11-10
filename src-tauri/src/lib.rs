pub mod claude;
pub mod store;
pub mod supervisor;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running Atelier");
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_version_matches_cargo() {
        assert_eq!(super::app_version(), env!("CARGO_PKG_VERSION"));
    }
}
