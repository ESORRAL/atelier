import type { NowPlaying } from "../../ipc/music";

export const POLL_MS = 1000;

/** Poll interval in ms, or null when nothing is visible or the window is idle. */
export const pollInterval = (visible: boolean, idle: boolean): number | null => (visible && !idle ? POLL_MS : null);

/** 102000 -> "01:42"; null or negative -> "--:--". */
export function fmtDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "--:--";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Progress in [0, 1]; 0 when the length is unknown. */
export function progress(n: Pick<NowPlaying, "positionMs" | "lengthMs">): number {
  if (!n.lengthMs || n.positionMs == null) return 0;
  return Math.min(1, Math.max(0, n.positionMs / n.lengthMs));
}

export const displayTitle = (n: NowPlaying) => n.title?.trim() || "Titre inconnu";
export const displaySub = (n: NowPlaying) => [n.artist, n.album].filter((x) => x?.trim()).join(" — ") || n.name;
