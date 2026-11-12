import type { SessionEntry } from "../../ipc/claude";
import type { UsageSummary } from "../../ipc/usage";
import type { VaultNote } from "../../ipc/vault";

export type Wikilink = { target: string; label: string };

/** Replaces `[[Note]]` / `[[Dir/Note|Text]]` by their visible text and lists the links (deduplicated). */
export function extractWikilinks(md: string): { text: string; links: Wikilink[] } {
  const links: Wikilink[] = [];
  const text = md.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, t: string, l?: string) => {
    const target = t.trim();
    const label = (l ?? target.split("/").pop() ?? target).trim();
    if (!links.some((x) => x.target === target && x.label === label)) links.push({ target, label });
    return label;
  });
  return { text, links };
}

const norm = (s: string) => s.toLowerCase().replace(/\.md$/, "");

/** Finds the note a wikilink points to: by path, then by file name, then by title. */
export function resolveLink(target: string, notes: VaultNote[]): VaultNote | undefined {
  const t = norm(target.split("#")[0]);
  const base = (p: string) => norm(p.split("/").pop() ?? p);
  return (
    notes.find((n) => norm(n.path) === t) ??
    notes.find((n) => base(n.path) === t.split("/").pop()) ??
    notes.find((n) => norm(n.title) === t)
  );
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function relativeDate(ms: number, now = Date.now()): string {
  const d = ms - now;
  for (const [u, size] of UNITS) if (Math.abs(d) >= size) return rtf.format(Math.round(d / size), u);
  return "à l'instant";
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString("fr-CA"); // YYYY-MM-DD, local time
const usd = (n: number) => `${n.toFixed(2)} $`;

/** French Markdown block for the end-of-day recap. */
export function buildRecap(sessions: SessionEntry[], usage: UsageSummary, now = Date.now()): string {
  const today = sessions.filter((s) => dayKey(s.updatedAt) === dayKey(now));
  const date = new Date(now).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const lines = [`## Récap du ${date}`, ""];
  if (today.length === 0) lines.push("Aucune session aujourd'hui.");
  else for (const s of today) lines.push(`- ${s.title} — \`${s.cwd}\` — ${usd(s.costUsd)}`);
  lines.push("", `Coût total : ${usd(usage.totalCostUsd)}`);
  const models = Object.keys(usage.byModel);
  if (models.length) lines.push(`Modèles : ${models.join(", ")}`);
  return lines.join("\n");
}

/** Joins a vault-relative folder ("" = root) and a child name. */
export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** Folders to unfold so that `path` becomes visible, root excluded: "a/b/c.md" -> ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export type TreeRow =
  | { kind: "folder"; path: string; name: string; depth: number; open: boolean; loading: boolean }
  | { kind: "note"; path: string; name: string; depth: number; note: VaultNote };

type Folder = { folders: string[]; notes: VaultNote[] };

/** Flattens the loaded part of the vault tree under `root`, folders first, both sorted by name. */
export function treeRows(root: string, loaded: ReadonlyMap<string, Folder>, open: ReadonlySet<string>, depth = 0): TreeRow[] {
  const f = loaded.get(root);
  if (!f) return [];
  const rows: TreeRow[] = [];
  for (const name of [...f.folders].sort((a, b) => a.localeCompare(b, "fr"))) {
    const path = joinPath(root, name);
    const isOpen = open.has(path);
    rows.push({ kind: "folder", path, name, depth, open: isOpen, loading: isOpen && !loaded.has(path) });
    if (isOpen) rows.push(...treeRows(path, loaded, open, depth + 1));
  }
  for (const note of [...f.notes].sort((a, b) => a.title.localeCompare(b.title, "fr")))
    rows.push({ kind: "note", path: note.path, name: note.title, depth, note });
  return rows;
}

/** Vault-relative paths a wikilink may point to without a full index: next to the current note, then from the root. */
export function linkCandidates(target: string, current: string): string[] {
  const t = target.split("#")[0].trim().replace(/^\/+/, "");
  if (!t || t.split("/").includes("..")) return [];
  const file = /\.md$/i.test(t) ? t : `${t}.md`;
  const dir = current.split("/").slice(0, -1).join("/");
  return [...new Set([joinPath(dir, file), file])];
}
