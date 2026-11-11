export const MAX_TERM = 200;

/** Trimmed search term, or null when empty or over the contract limit (1 to 200 characters). */
export function searchTerm(raw: string): string | null {
  const t = raw.trim();
  return t.length >= 1 && t.length <= MAX_TERM ? t : null;
}

/** Index to focus after Tab inside a trap of `count` items; null = let the browser handle it. */
export function trapIndex(current: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (shift && current <= 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}
