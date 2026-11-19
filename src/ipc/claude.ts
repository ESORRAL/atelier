import { Channel, invoke } from "@tauri-apps/api/core";

// Exact types of contracts/ipc.md §2.
export type PermissionMode = "default" | "acceptEdits" | "plan" | "auto";
export type Decision = "allow_once" | "allow_always" | "deny";
export type SessionState = "starting" | "idle" | "running" | "waiting_permission" | "closed" | "crashed";

export type SessionEvent =
  | { kind: "sdk"; message: unknown }
  | { kind: "user"; text: string } // turn sent by session_send (emitted and journaled by Rust)
  | {
      kind: "permission_request";
      requestId: string;
      toolName: string;
      input: unknown;
      toolUseID: string;
      displayName?: string;
      description?: string;
      blockedPath?: string;
      canAlways: boolean;
    }
  | { kind: "permission_cancelled"; requestId: string }
  | { kind: "state"; state: SessionState; error?: string }
  | { kind: "error"; message: string; fatal: boolean };

export type ModelInfo = { value: string; displayName: string; description?: string; [k: string]: unknown };

export type SessionEntry = {
  key: string;
  claudeSessionId: string | null;
  cwd: string;
  title: string;
  model: string | null;
  createdAt: number;
  updatedAt: number;
  costUsd: number;
};

export type Settings = {
  claudePath: string | null;
  defaultModel: string | null;
  defaultPermissionMode: PermissionMode;
  recentCwds: string[];
  vaultPath: string | null;
  vaultProject: string;
};

export const sessionStart = (
  cwd: string,
  model: string | null,
  permissionMode: PermissionMode,
  resume: string | null,
  onEvent: (e: SessionEvent) => void,
  effort: string | null = null,
) => {
  const channel = new Channel<SessionEvent>();
  channel.onmessage = onEvent;
  return invoke<string>("session_start", { cwd, model, permissionMode, resume, onEvent: channel, effort });
};
/** A picture for a user turn: base64 of the file, no `data:` prefix (contracts/ipc.md §1). */
export type ImageIn = { mediaType: string; data: string };
export const sessionSend = (key: string, text: string, images: ImageIn[] = []) =>
  invoke<null>("session_send", { key, text, images: images.length ? images : null });
export const sessionInterrupt = (key: string) => invoke<null>("session_interrupt", { key });
export const sessionSetModel = (key: string, model: string) => invoke<null>("session_set_model", { key, model });
/** Reasoning effort of the session (low, medium, high, xhigh, max); null = the model's own default. */
export const sessionSetEffort = (key: string, effort: string | null) => invoke<null>("session_set_effort", { key, effort });
export const sessionSetPermissionMode = (key: string, mode: PermissionMode) =>
  invoke<null>("session_set_permission_mode", { key, mode });
export const sessionModels = (key: string) => invoke<ModelInfo[]>("session_models", { key });
export const permissionRespond = (key: string, requestId: string, decision: Decision, message: string | null) =>
  invoke<null>("permission_respond", { key, requestId, decision, message });
export const sessionClose = (key: string) => invoke<null>("session_close", { key });
export const sessionsList = () => invoke<SessionEntry[]>("sessions_list");
export const sessionHistory = (key: string) => invoke<SessionEvent[]>("session_history", { key });
export const settingsGet = () => invoke<Settings>("settings_get");
export const settingsSet = (settings: Settings) => invoke<null>("settings_set", { settings });
