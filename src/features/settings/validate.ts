import type { PermissionMode, Settings } from "../../ipc/claude";

export const MODES: readonly PermissionMode[] = ["default", "acceptEdits", "plan"];
export const MODELS = ["opus", "sonnet", "haiku", "fable"] as const;

/** Returns a French error message, or null when the settings are acceptable. */
export function validateSettings(s: Settings): string | null {
  const p = s.claudePath;
  if (p !== null && p !== "" && !p.startsWith("/")) return "Le chemin du CLI doit être vide ou absolu (commencer par /).";
  if (!MODES.includes(s.defaultPermissionMode)) return "Mode de permission non autorisé.";
  if (s.defaultModel !== null && !(MODELS as readonly string[]).includes(s.defaultModel)) return "Modèle inconnu.";
  if (s.vaultPath !== null && !s.vaultPath.startsWith("/")) return "Le dossier du vault doit être un chemin absolu.";
  return null;
}

/** Empty path means "found in PATH": stored as null. */
export const normalize = (s: Settings): Settings => ({ ...s, claudePath: s.claudePath?.trim() || null, vaultPath: s.vaultPath?.trim() || null });
