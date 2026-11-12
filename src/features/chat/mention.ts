/** Pure helpers for the `/command` and `@file` autocompletion of the composer. */
export type Trigger = { kind: "command" | "file"; query: string; start: number; end: number };

/** The `/` or `@` word under the caret, or null. `/` only counts at the very start of the message. */
export function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)([/@])([^\s]*)$/.exec(before);
  if (!m) return null;
  const start = caret - m[2].length - 1;
  if (m[1] === "/" && text.slice(0, start).trim() !== "") return null;
  return { kind: m[1] === "/" ? "command" : "file", query: m[2], start, end: caret };
}

/** Replace the trigger word by `value` plus a space; returns the new text and caret. */
export function applyMention(text: string, t: Trigger, value: string): { text: string; caret: number } {
  const ins = `${t.kind === "command" ? "/" : "@"}${value} `;
  return { text: text.slice(0, t.start) + ins + text.slice(t.end), caret: t.start + ins.length };
}

/** Slash commands matching the query (prefix first, then substring), at most `limit`. */
export function filterCommands(commands: string[], query: string, limit = 8): string[] {
  const q = query.toLowerCase();
  const names = commands.map((c) => c.replace(/^\//, ""));
  const starts = names.filter((c) => c.toLowerCase().startsWith(q));
  const rest = names.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
  return [...starts, ...rest].slice(0, limit);
}
