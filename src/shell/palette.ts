export type Command = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  run: () => void;
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** 3 = prefix, 2 = word prefix, 1 = substring, 0 = no match. */
function score(label: string, q: string): number {
  const l = norm(label);
  if (l.startsWith(q)) return 3;
  if (l.split(/[\s'-]+/).some((w) => w.startsWith(q))) return 2;
  return l.includes(q) ? 1 : 0;
}

/** Accent-insensitive filter; best score first, original order kept among equals. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = norm(query.trim());
  if (!q) return commands;
  return commands
    .map((c, i) => ({ c, i, s: score(c.label, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/** Wraps around the list. */
export const moveIndex = (index: number, delta: number, length: number) =>
  length ? (index + delta + length) % length : 0;

/** Runs the command at `index` of the filtered list; returns whether one ran. */
export function execute(commands: Command[], query: string, index: number): boolean {
  const cmd = filterCommands(commands, query)[index];
  cmd?.run();
  return !!cmd;
}
