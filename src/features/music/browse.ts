import type { SearchResults } from "../../ipc/music";

export type View = { kind: "results" | "artist" | "album"; title: string; data: SearchResults };

/** Navigation stack: results -> artist -> album. Empty = no search yet. */
export const push = (stack: View[], view: View): View[] => [...stack, view];
export const back = (stack: View[]): View[] => stack.slice(0, -1);
export const current = (stack: View[]): View | null => stack[stack.length - 1] ?? null;
export const canGoBack = (stack: View[]): boolean => stack.length > 1;

/** One preview at a time: clicking the playing song stops it, any other song replaces it. */
export const togglePreview = (playing: number | null, id: number): number | null => (playing === id ? null : id);

/** m:ss label, or null when unknown. */
export function duration(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
