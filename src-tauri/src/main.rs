// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    atelier_lib::supervisor::maybe_run_watchdog();
    atelier_lib::run()
}
