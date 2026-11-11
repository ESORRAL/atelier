import type { TallyState } from "../../ui/Tally";

export type AgentCard = {
  id: string; // session key + task_id
  sessionKey: string;
  type: string;
  task: string;
  state: TallyState;
  tokens: number | null;
  durationMs: number | null;
  startedAt: number; // reception time (ms), to show the elapsed time of a running agent
  toolUseId: string;
  lastMessage: string;
};

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped SDK payload, read defensively

const DONE = new Set(["completed", "success"]);
const FAILED = new Set(["failed", "killed", "stopped", "error", "cancelled"]);
export const stateOf = (status: unknown): TallyState =>
  typeof status !== "string" ? "running" : DONE.has(status) ? "done" : FAILED.has(status) ? "failed" : status === "pending" ? "queued" : "running";

const textOf = (m: Msg): string =>
  (Array.isArray(m.message?.content) ? m.message.content : [])
    .filter((b: Msg) => b?.type === "text" && typeof b.text === "string")
    .map((b: Msg) => b.text)
    .join(" ")
    .trim();

/** Cards per session key, oldest launch first. Fed event by event, so a chatty session never pushes a card out. */
export type AgentStore = Map<string, Map<string, AgentCard>>;
export const MAX_AGENTS = 500; // per session, the oldest card goes first

/** Folds one raw SDK message of a session into its cards. `now` is the reception time. */
export function applyAgentEvent(store: AgentStore, sessionKey: string, m: Msg, now = Date.now()) {
  if (!m || typeof m !== "object") return;
  let cards = store.get(sessionKey);
  const id = `${sessionKey}:${m.task_id}`;
  if (m.type === "system" && m.subtype === "task_started") {
    if (!cards) store.set(sessionKey, (cards = new Map()));
    cards.set(id, {
      id, sessionKey, type: m.subagent_type ?? "agent", task: m.description ?? "", toolUseId: m.tool_use_id,
      state: "running", tokens: null, durationMs: null, startedAt: now, lastMessage: "",
    });
    if (cards.size > MAX_AGENTS) cards.delete(cards.keys().next().value as string);
  } else if (m.type === "system" && m.subtype === "task_updated") {
    const c = cards?.get(id);
    if (c && m.patch?.status) c.state = stateOf(m.patch.status);
  } else if (m.type === "system" && m.subtype === "task_notification") {
    const c = cards?.get(id);
    if (!c) return;
    c.state = stateOf(m.status);
    c.tokens = m.usage?.total_tokens ?? c.tokens;
    c.durationMs = m.usage?.duration_ms ?? c.durationMs;
    if (m.summary) c.lastMessage = m.summary;
  } else if (m.type === "assistant" && m.parent_tool_use_id) {
    const t = textOf(m);
    const c = t && [...(cards?.values() ?? [])].find((x) => x.toolUseId === m.parent_tool_use_id);
    if (c && t) c.lastMessage = t;
  }
}

/** Every card, in launch order per session. */
export const listAgents = (store: AgentStore): AgentCard[] => [...store.values()].flatMap((c) => [...c.values()]);

/** Known duration, else the time elapsed since launch while the agent runs. */
export const durationOf = (c: AgentCard, now: number): number | null =>
  c.durationMs ?? (c.state === "running" || c.state === "queued" ? Math.max(0, now - c.startedAt) : null);

export type Filter = "all" | "running" | "done" | "failed";
export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "running", label: "En cours" },
  { id: "done", label: "Terminés" },
  { id: "failed", label: "Échecs" },
];
export const matches = (c: AgentCard, f: Filter) =>
  f === "all" || (f === "running" ? c.state === "running" || c.state === "queued" : c.state === f);
