import { invoke } from "@tauri-apps/api/core";

// All paths are relative to the vault root (`vaultPath`), contracts/ipc.md §10 bis.
export type VaultNote = { path: string; title: string; modified: number };
export type VaultHit = { path: string; title: string; line: number; excerpt: string };
export type VaultFolder = { path: string; folders: string[]; notes: VaultNote[] };

export const vaultList = (folder: string | null) => invoke<VaultFolder>("vault_list", { folder });
export const vaultRecent = (limit: number) => invoke<VaultNote[]>("vault_recent", { limit });
export const vaultRead = (path: string) => invoke<string>("vault_read", { path });
export const vaultSearch = (query: string) => invoke<VaultHit[]>("vault_search", { query });
export const vaultOpen = (path: string) => invoke<null>("vault_open", { path });
export const vaultAppendJournal = (markdown: string) => invoke<null>("vault_append_journal", { markdown });
