// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    atelier_lib::supervisor::maybe_run_watchdog();
    // Intel VA-API decoders stall WebKitGTK after a few YouTube Shorts (frozen video, seen 2026-11-13):
    // rank them out so GStreamer decodes in software. Inherited by the WebKit web processes.
    const NO_VA: &str = "vah264dec:0,vah265dec:0,vavp9dec:0,vaav1dec:0";
    let ranks = match std::env::var("GST_PLUGIN_FEATURE_RANK") {
        Ok(r) if !r.is_empty() => format!("{r},{NO_VA}"),
        _ => NO_VA.to_string(),
    };
    // SAFETY: first thing in main, before any other thread exists.
    unsafe { std::env::set_var("GST_PLUGIN_FEATURE_RANK", ranks) };
    atelier_lib::run()
}
