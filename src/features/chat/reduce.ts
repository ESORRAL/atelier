import type { SessionEvent, SessionState } from "../../ipc/claude";

export type ToolStatus = "running" | "done" | "failed" | "denied";
export type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; id: string; name: string; input: unknown; status: ToolStatus };

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      blocks: Block[];
      live: { kind: "text" | "thinking"; text: string } | null; // block being streamed
      status: "running" | "done" | "stopped";
    };

export type PermissionRequest = Extract<SessionEvent, { kind: "permission_request" }> & { cancelled?: boolean };

export type ChatState = {
  messages: ChatMessage[];
  sessionState: SessionState | null;
  model: string | null;
  claudeSessionId: string | null;
  costUsd: number;
  permissions: PermissionRequest[];
  error: string | null;
  nextId: number;
};

export type ChatAction = SessionEvent | { kind: "reset" } | { kind: "permission_done"; requestId: string };

export const initialState: ChatState = {
  messages: [],
  sessionState: null,
  model: null,
  claudeSessionId: null,
  costUsd: 0,
  permissions: [],
  error: null,
  nextId: 1,
};

type Obj = Record<string, any>; // SDK messages are untyped on purpose (bridge-protocol §4)

/** Last assistant message if its turn is still open, else a fresh one. */
function withCurrent(s: ChatState, edit: (m: Extract<ChatMessage, { role: "assistant" }>) => Extract<ChatMessage, { role: "assistant" }>): ChatState {
  const last = s.messages[s.messages.length - 1];
  if (last?.role === "assistant" && last.status === "running") {
    return { ...s, messages: [...s.messages.slice(0, -1), edit(last)] };
  }
  const fresh: ChatMessage = { id: `a${s.nextId}`, role: "assistant", blocks: [], live: null, status: "running" };
  return { ...s, nextId: s.nextId + 1, messages: [...s.messages, edit(fresh as Extract<ChatMessage, { role: "assistant" }>)] };
}

function reduceSdk(s: ChatState, m: Obj): ChatState {
  if (m.session_id && !s.claudeSessionId) s = { ...s, claudeSessionId: m.session_id };
  switch (m.type) {
    case "system":
      return m.subtype === "init" && typeof m.model === "string" ? { ...s, model: m.model } : s;
    case "stream_event": {
      if (m.parent_tool_use_id) return s; // shortcut: sub-agent output is not shown in the chat
      const e: Obj = m.event ?? {};
      if (e.type === "content_block_start" && (e.content_block?.type === "text" || e.content_block?.type === "thinking")) {
        return withCurrent(s, (a) => ({ ...a, live: { kind: e.content_block.type, text: "" } }));
      }
      if (e.type === "content_block_delta") {
        const d: Obj = e.delta ?? {};
        const kind = d.type === "text_delta" ? "text" : d.type === "thinking_delta" ? "thinking" : null;
        if (!kind) return s;
        const add: string = (kind === "text" ? d.text : d.thinking) ?? "";
        return withCurrent(s, (a) => ({
          ...a,
          live: { kind, text: (a.live?.kind === kind ? a.live.text : "") + add },
        }));
      }
      return s;
    }
    case "assistant": {
      if (m.parent_tool_use_id) return s;
      const content: Obj[] = Array.isArray(m.message?.content) ? m.message.content : [];
      const blocks: Block[] = [];
      for (const c of content) {
        if (c.type === "text") blocks.push({ type: "text", text: c.text ?? "" });
        else if (c.type === "thinking") blocks.push({ type: "thinking", text: c.thinking ?? "" });
        else if (c.type === "tool_use") blocks.push({ type: "tool", id: c.id, name: c.name, input: c.input, status: "running" });
      }
      return withCurrent(s, (a) => ({ ...a, blocks: [...a.blocks, ...blocks], live: null }));
    }
    case "user": {
      const content: Obj[] = Array.isArray(m.message?.content) ? m.message.content : [];
      const results = content.filter((c) => c.type === "tool_result");
      if (!results.length) return s;
      const meta: Obj[] = Array.isArray(m.tool_result_meta) ? m.tool_result_meta : [];
      const status = (r: Obj): ToolStatus =>
        meta.find((x) => x.id === r.tool_use_id)?.permission_decision?.decision === "reject"
          ? "denied"
          : r.is_error
            ? "failed"
            : "done";
      const touches = (b: Block) => b.type === "tool" && results.some((x) => x.tool_use_id === b.id);
      return {
        ...s,
        // Only messages holding a matching tool block are recreated, so the others keep their identity.
        messages: s.messages.map((msg) =>
          msg.role !== "assistant" || !msg.blocks.some(touches)
            ? msg
            : {
                ...msg,
                blocks: msg.blocks.map((b) => {
                  const r = touches(b) && b.type === "tool" ? results.find((x) => x.tool_use_id === b.id) : undefined;
                  return r && b.type === "tool" ? { ...b, status: status(r) } : b;
                }),
              },
        ),
      };
    }
    case "result": {
      // Interrupt ends with error_during_execution: shown as "Arrêté", never as an error.
      const aborted = m.subtype === "error_during_execution";
      const last = s.messages[s.messages.length - 1];
      const messages =
        last?.role === "assistant" && last.status === "running"
          ? [...s.messages.slice(0, -1), { ...last, live: null, status: aborted ? ("stopped" as const) : ("done" as const) }]
          : s.messages;
      return {
        ...s,
        messages,
        costUsd: typeof m.total_cost_usd === "number" ? m.total_cost_usd : s.costUsd, // cumulative: replace
        error: !aborted && m.is_error ? "Le tour s'est terminé en erreur." : s.error,
      };
    }
    default:
      return s;
  }
}

export function reduce(s: ChatState, a: ChatAction): ChatState {
  switch (a.kind) {
    case "reset":
      return initialState;
    case "user":
      return { ...s, error: null, nextId: s.nextId + 1, messages: [...s.messages, { id: `u${s.nextId}`, role: "user", text: a.text }] };
    case "sdk":
      return reduceSdk(s, a.message as Obj);
    case "permission_request":
      return { ...s, permissions: [...s.permissions, a] };
    case "permission_done":
      return { ...s, permissions: s.permissions.filter((p) => p.requestId !== a.requestId) };
    case "permission_cancelled":
      return { ...s, permissions: s.permissions.map((p) => (p.requestId === a.requestId ? { ...p, cancelled: true } : p)) };
    case "state":
      return { ...s, sessionState: a.state, error: a.error ?? s.error };
    case "error":
      return { ...s, error: a.message };
  }
}
