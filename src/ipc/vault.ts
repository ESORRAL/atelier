import { invoke } from "@tauri-apps/api/core";

export type VaultNote = { path: string; title: string; modified: number };
export type VaultHit = { path: string; title: string; line: number; excerpt: string };

export const vaultList = () => invoke<VaultNote[]>("vault_list");
export const vaultRead = (path: string) => invoke<string>("vault_read", { path });
export const vaultSearch = (query: string) => invoke<VaultHit[]>("vault_search", { query });
export const vaultOpen = (path: string) => invoke<null>("vault_open", { path });
export const vaultAppendJournal = (markdown: string) => invoke<null>("vault_append_journal", { markdown });
