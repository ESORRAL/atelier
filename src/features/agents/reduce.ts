import type { TallyState } from "../../ui/Tally";

export type AgentCard = {
  id: string; // session key + task_id
  sessionKey: string;
  type: string;
  task: string;
  state: TallyState;
  tokens: number | null;
  durationMs: number | null;
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

/** Folds the raw event lines of every session (oldest first) into one card per sub-agent, in launch order. */
export function reduceAgents(log: ReadonlyMap<string, string[]>): AgentCard[] {
  const cards = new Map<string, AgentCard>();
  const byTool = new Map<string, AgentCard>();
  for (const [sessionKey, lines] of log) {
    for (const line of lines) {
      let m: Msg;
      try {
        const e = JSON.parse(line);
        if (e?.kind !== "sdk" || !e.message) continue;
        m = e.message;
      } catch {
        continue; // truncated line (see LOG_LINE_MAX)
      }
      const id = `${sessionKey}:${m.task_id}`;
      if (m.type === "system" && m.subtype === "task_started") {
        const c: AgentCard = {
          id, sessionKey, type: m.subagent_type ?? "agent", task: m.description ?? "",
          state: "running", tokens: null, durationMs: null, lastMessage: "",
        };
        cards.set(id, c);
        byTool.set(`${sessionKey}:${m.tool_use_id}`, c);
      } else if (m.type === "system" && m.subtype === "task_updated") {
        const c = cards.get(id);
        if (c && m.patch?.status) c.state = stateOf(m.patch.status);
      } else if (m.type === "system" && m.subtype === "task_notification") {
        const c = cards.get(id);
        if (!c) continue;
        c.state = stateOf(m.status);
        c.tokens = m.usage?.total_tokens ?? c.tokens;
        c.durationMs = m.usage?.duration_ms ?? c.durationMs;
        if (m.summary) c.lastMessage = m.summary;
      } else if (m.type === "assistant" && m.parent_tool_use_id) {
        const c = byTool.get(`${sessionKey}:${m.parent_tool_use_id}`);
        const t = c && textOf(m);
        if (c && t) c.lastMessage = t;
      }
    }
  }
  return [...cards.values()];
}

export type Filter = "all" | "running" | "done" | "failed";
export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "running", label: "En cours" },
  { id: "done", label: "Terminés" },
  { id: "failed", label: "Échecs" },
];
export const matches = (c: AgentCard, f: Filter) =>
  f === "all" || (f === "running" ? c.state === "running" || c.state === "queued" : c.state === f);
