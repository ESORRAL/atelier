/** Pure keyboard logic of the small text menus under the composer (WAI-ARIA menu pattern). */
export type MenuMove = { index: number } | "select" | "close" | null;

/** What a key does inside an open menu of `n` items with `index` focused; null = not handled. */
export function menuKey(key: string, index: number, n: number): MenuMove {
  if (n <= 0) return key === "Escape" || key === "Tab" ? "close" : null;
  switch (key) {
    case "ArrowDown": return { index: (index + 1) % n };
    case "ArrowUp": return { index: (index - 1 + n) % n };
    case "Home": return { index: 0 };
    case "End": return { index: n - 1 };
    case "Enter":
    case " ": return "select";
    case "Escape":
    case "Tab": return "close";
    default: return null;
  }
}

/** Index to focus when the menu opens: the current value, else the first item. */
export const initialIndex = (values: string[], current: string | null) => Math.max(0, values.indexOf(current ?? ""));

/** Inserts "@" at the caret (a space first when glued to a word) to open the file list. */
export function insertAt(text: string, caret: number): { text: string; caret: number } {
  const glued = caret > 0 && !/\s/.test(text[caret - 1]);
  const ins = glued ? " @" : "@";
  return { text: text.slice(0, caret) + ins + text.slice(caret), caret: caret + ins.length };
}
