import { invoke } from "@tauri-apps/api/core";

/** Native "choose a folder" dialog; null when cancelled. */
export const pickFolder = () => invoke<string | null>("pick_folder");

/** Opens the isolated Instagram window, or brings it to the front (contracts/ipc.md §13). */
export const pauseWindowOpen = () => invoke<null>("pause_window_open");
export const pauseWindowClose = () => invoke<null>("pause_window_close");

/** Opens or closes the Instagram panel; "window" when the separate window was used instead (contracts/ipc.md §15). */
export const pausePanelToggle = (open: boolean) => invoke<"panel" | "window">("pause_panel_toggle", { open });
