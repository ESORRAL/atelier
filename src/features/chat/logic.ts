import type { ModelInfo, SessionState } from "../../ipc/claude";

/** Option value matching a full model id (`s.model`), by `value` or `resolvedModel`. */
export function matchModel(current: string | null, models: ModelInfo[]): string | null {
  if (!current) return null;
  return models.find((m) => m.value === current || m.resolvedModel === current)?.value ?? null;
}

/** A turn can only be sent once the bridge is idle: never while running or waiting for a permission. */
export const canSend = (state: SessionState | null, draft: string) => state === "idle" && draft.trim() !== "";
