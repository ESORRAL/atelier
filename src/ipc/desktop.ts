import { invoke } from "@tauri-apps/api/core";

/** Native "choose a folder" dialog; null when cancelled. */
export const pickFolder = () => invoke<string | null>("pick_folder");

/** Opens the isolated Instagram window, or brings it to the front (contracts/ipc.md §13). */
export const pauseWindowOpen = () => invoke<null>("pause_window_open");
export const pauseWindowClose = () => invoke<null>("pause_window_close");

export type PauseSite = "shorts" | "instagram";

/** Opens or closes an in-app panel; the fallback used when it could not be installed otherwise (contracts/ipc.md §15 ter). */
export const pausePanelToggle = (site: PauseSite, open: boolean) =>
  invoke<"panel" | "browser" | "window">("pause_panel_toggle", { site, open });

/** Opens the site at a fixed address in the system browser (contracts/ipc.md §15 ter). */
export const pauseOpenBrowser = (site: PauseSite) => invoke<null>("pause_open_browser", { site });
