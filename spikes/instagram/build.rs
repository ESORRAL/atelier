fn main() {
    // Without an app manifest, Tauri allows every invoke_handler command for every window.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["probe"])),
    )
    .expect("tauri-build failed");
}
