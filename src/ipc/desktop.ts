import { invoke } from "@tauri-apps/api/core";

/** Native "choose a folder" dialog; null when cancelled. */
export const pickFolder = () => invoke<string | null>("pick_folder");
