import type { AgentPhase, DiffRow, TraceNode } from "@/components/ui/ai-thinking-and-tool-calls";
import type { Block, ChatMessage, ToolStatus } from "./reduce";

type Assistant = Extract<ChatMessage, { role: "assistant" }>;
type Obj = Record<string, any>; // tool inputs are untyped SDK data

const STATUS: Record<ToolStatus, TraceNode["status"]> = { running: "running", done: "completed", failed: "failed", denied: "failed" };
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Read results are numbered like `cat -n` ("     1\t…" or "1→…"): strip the numbers, keep the first one. */
export function stripLineNumbers(text: string): { code: string; lineStart: number } {
  const lines = text.split("\n");
  const first = lines[0]?.match(/^\s*(\d+)[\t→]/);
  if (!first) return { code: text, lineStart: 1 };
  return { code: lines.map((l) => l.replace(/^\s*\d+[\t→]/, "")).join("\n"), lineStart: Number(first[1]) };
}

/** Edit old_string → new_string: common leading/trailing lines as context, the middle as del then add. */
export function diffRows(oldText: string, newText: string): { rows: DiffRow[]; add: number; del: number } {
  const lines = (t: string) => (t === "" ? [] : t.split("\n"));
  const a = lines(oldText);
  const b = lines(newText);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const del = a.slice(head, a.length - tail);
  const add = b.slice(head, b.length - tail);
  const rows: DiffRow[] = [
    ...a.slice(0, head).map((text) => ({ type: "ctx" as const, text })),
    ...del.map((text) => ({ type: "del" as const, text })),
    ...add.map((text) => ({ type: "add" as const, text })),
    ...a.slice(a.length - tail).map((text) => ({ type: "ctx" as const, text })),
  ];
  return { rows, add: add.length, del: del.length };
}

export function toolNode(b: Extract<Block, { type: "tool" }>): TraceNode {
  const input: Obj = b.input && typeof b.input === "object" ? (b.input as Obj) : {};
  const base = { id: b.id, status: STATUS[b.status] };
  const result = b.result || undefined;
  const path = str(input.file_path) ?? str(input.path);
  switch (b.name) {
    case "Bash":
      return { ...base, type: "terminal", command: str(input.command) ?? "", output: result, exitCode: b.status === "failed" || b.status === "denied" ? 1 : 0 };
    case "Read": {
      const read = result && b.status === "done" ? stripLineNumbers(result) : undefined;
      return { ...base, type: "tool", toolName: "read_file", args: { path }, code: read?.code, lineStart: read?.lineStart, codeSnippet: read ? undefined : result };
    }
    case "Edit": {
      const d = diffRows(str(input.old_string) ?? "", str(input.new_string) ?? "");
      return { ...base, type: "tool", toolName: "edit_file", args: { path }, diffRows: d.rows, diffFile: path, add: d.add, del: d.del };
    }
    case "Write":
      return { ...base, type: "tool", toolName: "write_file", args: { path, content: str(input.content) } };
    case "Grep":
      return { ...base, type: "tool", toolName: "search", args: { pattern: str(input.pattern), path }, codeSnippet: result };
    case "Glob":
      return { ...base, type: "tool", toolName: "glob", args: { pattern: str(input.pattern), path }, codeSnippet: result };
    case "WebFetch":
      return { ...base, type: "tool", toolName: "fetch", args: { url: str(input.url), prompt: str(input.prompt) }, codeSnippet: result };
    case "WebSearch":
      return { ...base, type: "tool", toolName: "web", args: { query: str(input.query) }, codeSnippet: result };
    case "Agent":
    case "Task":
      return { ...base, type: "tool", toolName: "agent", args: { description: str(input.description) }, codeSnippet: result };
  }
  if (b.name.startsWith("mcp__")) return { ...base, type: "tool", toolName: "mcp", args: { ...input, label: b.name }, codeSnippet: result };
  return { ...base, type: "tool", toolName: b.name, args: input, codeSnippet: result };
}

/**
 * One assistant turn → phases: each run of thinking/tool blocks is a trace, the prose after it its message.
 * The block being streamed (`live`) is appended: running reasoning, or text added to the last message.
 */
export function toPhases(m: Pick<Assistant, "blocks" | "live">): AgentPhase[] {
  const phases: AgentPhase[] = [];
  const current = () => phases[phases.length - 1];
  const addNode = (n: TraceNode) => {
    if (!current() || current().message !== undefined) phases.push({ trace: [] });
    current().trace.push(n);
  };
  const addText = (text: string) => {
    if (!current()) phases.push({ trace: [] });
    const p = current();
    p.message = p.message === undefined ? text : `${p.message}\n\n${text}`;
  };
  const reasoning = (text: string, durationMs: number | undefined, status: TraceNode["status"]): TraceNode => ({
    type: "reasoning",
    sentences: text.split(/\n+/).map((t) => t.trim()).filter(Boolean), // the SDK usually sends empty thinking: no body
    durationSeconds: (durationMs ?? 0) / 1000,
    status,
  });
  m.blocks.forEach((b) => {
    if (b.type === "text") addText(b.text);
    else if (b.type === "thinking") addNode(reasoning(b.text, b.durationMs, "completed"));
    else addNode(toolNode(b));
  });
  if (m.live?.kind === "thinking") addNode(reasoning(m.live.text, undefined, "running"));
  else if (m.live?.kind === "text") addText(m.live.text);
  return phases;
}
