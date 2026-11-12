import type { SessionEntry, SessionEvent, SessionState } from "../../ipc/claude";
import type { TallyState } from "../../ui/Tally";

export const MAX_TABS = 8;
export const TOO_MANY_TABS = `${MAX_TABS} sessions au plus peuvent rester ouvertes. Ferme un onglet pour en ouvrir une autre.`;

/** One open session in the Chat tab bar. `id` is local; `key` arrives once `session_start` resolves. */
export type SessionTab = {
  id: number;
  cwd: string;
  resume: SessionEntry | null;
  first: string | null; // first message typed on the welcome screen
  key: string | null;
  title: string;
  state: SessionState | null;
  pending: number; // permission requests waiting in this session's queue
};
/** `active: null` = the welcome screen. */
export type SessionTabs = { list: SessionTab[]; active: number | null; next: number };
export const noTabs: SessionTabs = { list: [], active: null, next: 1 };

export const folderName = (cwd: string) => cwd.replace(/\/+$/, "").split("/").pop() || cwd;
const keyOf = (t: SessionTab) => t.key ?? t.resume?.key ?? null;

/** Opens and selects a tab; resuming a session already open selects its tab. `null` when the bar is full. */
export function openTab(t: SessionTabs, cwd: string, resume: SessionEntry | null = null, first: string | null = null): SessionTabs | null {
  const open = resume && t.list.find((x) => keyOf(x) === resume.key);
  if (open) return { ...t, active: open.id };
  if (t.list.length >= MAX_TABS) return null;
  const tab: SessionTab = { id: t.next, cwd, resume, first, key: null, title: resume?.title || folderName(cwd), state: null, pending: 0 };
  return { list: [...t.list, tab], active: tab.id, next: t.next + 1 };
}

/** Removes a tab; if it was shown, its right neighbour (else left, else the welcome screen) is shown. */
export function closeTab(t: SessionTabs, id: number): SessionTabs {
  const i = t.list.findIndex((x) => x.id === id);
  if (i < 0) return t;
  const list = t.list.filter((x) => x.id !== id);
  const active = t.active !== id ? t.active : (list[i] ?? list[i - 1])?.id ?? null;
  return { ...t, list, active };
}

export const selectTab = (t: SessionTabs, id: number | null): SessionTabs =>
  id === null || t.list.some((x) => x.id === id) ? { ...t, active: id } : t;

/** Next (`1`) or previous (`-1`) tab, wrapping; from the welcome screen, the first or last tab. */
export function cycleTab(t: SessionTabs, step: 1 | -1): SessionTabs {
  const n = t.list.length;
  if (!n) return t;
  const i = t.list.findIndex((x) => x.id === t.active);
  const j = i < 0 ? (step === 1 ? 0 : n - 1) : (i + step + n) % n;
  return { ...t, active: t.list[j].id };
}

export function patchTab(t: SessionTabs, id: number, patch: Partial<Pick<SessionTab, "key" | "title" | "state" | "pending">>): SessionTabs {
  const tab = t.list.find((x) => x.id === id);
  if (!tab || (Object.keys(patch) as (keyof typeof patch)[]).every((k) => tab[k] === patch[k])) return t;
  return { ...t, list: t.list.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

/** Requests still awaiting an answer; a cancelled one only waits to be dismissed. */
export const pendingCount = (permissions: { cancelled?: boolean }[]) => permissions.filter((p) => !p.cancelled).length;

export function tallyOf(t: Pick<SessionTab, "state" | "pending">): TallyState {
  if (t.pending > 0 || t.state === "waiting_permission") return "waiting-permission";
  if (t.state === "running") return "running";
  if (t.state === "crashed") return "failed";
  return t.state === "idle" || t.state === "closed" ? "done" : "queued";
}

/** `Ctrl+Tab` → 1, `Ctrl+Maj+Tab` → -1, anything else → 0 (physical key, DESIGN.md §5.6). */
export const cycleStep = (e: Pick<KeyboardEvent, "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): 1 | -1 | 0 =>
  e.code === "Tab" && e.ctrlKey && !e.altKey && !e.metaKey ? (e.shiftKey ? -1 : 1) : 0;

/** Raw events kept per session key, newest last (bottom drawer, Agents tab). */
export type SessionEventLog = Map<string, string[]>;
export const LOG_MAX = 200;
const LOG_LINE_MAX = 4000;

export function logEvent(log: SessionEventLog, key: string, e: SessionEvent) {
  let line = JSON.stringify(e);
  if (line.length > LOG_LINE_MAX) line = `${line.slice(0, LOG_LINE_MAX)}…`;
  const lines = log.get(key) ?? [];
  lines.push(line);
  if (lines.length > LOG_MAX) lines.shift();
  log.set(key, lines);
}
