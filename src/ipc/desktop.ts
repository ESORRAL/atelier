import { invoke } from "@tauri-apps/api/core";

/** Native "choose a folder" dialog; null when cancelled. */
export const pickFolder = () => invoke<string | null>("pick_folder");

/** Opens the isolated Instagram window, or brings it to the front (contracts/ipc.md §13). */
export const pauseWindowOpen = () => invoke<null>("pause_window_open");
export const pauseWindowClose = () => invoke<null>("pause_window_close");
