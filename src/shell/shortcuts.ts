export type ShortcutAction =
  | { kind: "palette" }
  | { kind: "tab"; index: number } // 0-based
  | { kind: "drawer" }
  | { kind: "focus" };

type Keys = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/** DESIGN.md §5.6: letters by `key`, digits/punctuation by `code` (AZERTY-safe), F-key alternatives. */
export function shortcutAction(e: Keys): ShortcutAction | null {
  if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "f") return { kind: "focus" };
  if (e.altKey || e.metaKey || e.shiftKey) return null;
  if (!e.ctrlKey) {
    const f = /^F([1-9]|12)$/.exec(e.key);
    if (!f) return null;
    return f[1] === "12" ? { kind: "drawer" } : { kind: "tab", index: Number(f[1]) - 1 };
  }
  const letter = e.key.toLowerCase();
  if (letter === "k" || letter === "p") return { kind: "palette" };
  if (e.code === "Backquote") return { kind: "drawer" };
  const d = /^Digit([1-9])$/.exec(e.code);
  return d ? { kind: "tab", index: Number(d[1]) - 1 } : null;
}
