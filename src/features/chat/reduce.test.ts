import { expect, test } from "vitest";
import streamRaw from "../../../spikes/bridge/samples/stream.ndjson?raw";
import interruptRaw from "../../../spikes/bridge/samples/interrupt.ndjson?raw";
import { initialState, reduce, type ChatState } from "./reduce";

const raw: Record<string, string> = { stream: streamRaw, interrupt: interruptRaw };
const load = (f: string) =>
  raw[f]
    .split("\n")
    .filter(Boolean)
    .map((l: any) => JSON.parse(l))
    .filter((l: any) => l.kind === "message" && l.data?.type)
    .map((l: any) => ({ kind: "sdk" as const, message: l.data }));

const run = (events: ReturnType<typeof load>, s: ChatState = initialState) => events.reduce(reduce, s);
const assistant = (s: ChatState) => {
  const m = s.messages.find((x) => x.role === "assistant");
  if (m?.role !== "assistant") throw new Error("no assistant message");
  return m;
};

test("stream sample: live text, then complete block, then cost", () => {
  const ev = load("stream");
  const iDelta = ev.findIndex((e: any) => (e.message as any).event?.delta?.type === "text_delta");
  const mid = run(ev.slice(0, iDelta + 1));
  expect(assistant(mid).live).toEqual({ kind: "text", text: "hello from haiku" });
  expect(assistant(mid).status).toBe("running");

  const end = run(ev);
  const a = assistant(end);
  expect(a.live).toBeNull();
  expect(a.blocks[a.blocks.length - 1]).toEqual({ type: "text", text: "hello from haiku" });
  expect(a.status).toBe("done");
  expect(end.costUsd).toBeCloseTo(0.00040317);
  expect(end.model).toBe("claude-haiku-5-5");
  expect(end.error).toBeNull();
});

test("interrupt sample: partial text kept, marked stopped, not an error, cost replaced", () => {
  const ev = load("interrupt");
  const iResult = ev.findIndex((e: any) => (e.message as any).type === "result");
  const s1 = run(ev.slice(0, iResult + 1));
  const a = assistant(s1);
  expect(a.status).toBe("stopped");
  expect(s1.error).toBeNull();
  const text = a.blocks.find((b) => b.type === "text");
  expect(text && "text" in text && text.text.startsWith("# The Long Water")).toBe(true);
  expect(s1.costUsd).toBeCloseTo(0.0001256);

  const s2 = run(ev);
  expect(s2.costUsd).toBeCloseTo(0.00348395); // replaced by the last total, not summed
});

const sdk = (message: object) => ({ kind: "sdk" as const, message });

test("tool card: running, then done / failed / denied from tool_result", () => {
  const use = (id: string) => ({ type: "tool_use", id, name: "Write", input: { file_path: "a" } });
  let s = run([
    sdk({ type: "assistant", message: { content: [use("t1"), use("t2"), use("t3")] } }),
  ] as any);
  expect(assistant(s).blocks.map((b) => b.type === "tool" && b.status)).toEqual(["running", "running", "running"]);
  s = run(
    [
      sdk({
        type: "user",
        message: { content: [
          { type: "tool_result", tool_use_id: "t1", content: "ok" },
          { type: "tool_result", tool_use_id: "t2", content: "boom", is_error: true },
          { type: "tool_result", tool_use_id: "t3", content: "refused", is_error: true },
        ] },
        tool_result_meta: [{ id: "t3", permission_decision: { decision: "reject", source: "user_reject" } }],
      }),
    ],
    s,
  );
  expect(assistant(s).blocks.map((b) => b.type === "tool" && b.status)).toEqual(["done", "failed", "denied"]);
});

test("permission queue: add then mark cancelled; state event", () => {
  let s = reduce(initialState, { kind: "permission_request", requestId: "r1", toolName: "Bash", input: {}, toolUseID: "t", canAlways: true });
  s = reduce(s, { kind: "state", state: "waiting_permission" });
  s = reduce(s, { kind: "permission_cancelled", requestId: "r1" });
  expect(s.permissions[0].cancelled).toBe(true);
  expect(s.sessionState).toBe("waiting_permission");
});

test("replayed history with two user turns", () => {
  const ev = [{ kind: "user" as const, text: "un" }, ...load("stream"), { kind: "user" as const, text: "deux" }, ...load("interrupt")];
  const s = run(ev as any);
  expect(s.messages.filter((m) => m.role === "user")).toMatchObject([{ text: "un" }, { text: "deux" }]);
  expect(s.messages[1].role).toBe("assistant"); // the interrupt sample holds two assistant turns itself
});

test("tool_result recreates only the message holding the tool", () => {
  const turn = (id: string) => [
    sdk({ type: "assistant", message: { content: [{ type: "tool_use", id, name: "Read", input: {} }] } }),
    sdk({ type: "result", subtype: "success", total_cost_usd: 0 }),
  ];
  const s = run([{ kind: "user", text: "a" }, ...turn("t1"), ...turn("t2")] as any);
  const s2 = run([sdk({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "ok" }] } })] as any, s);
  expect(s2.messages[0]).toBe(s.messages[0]);
  expect(s2.messages[1]).toBe(s.messages[1]);
  expect(s2.messages[2]).not.toBe(s.messages[2]);
});

test("permission_done removes the request from the queue", () => {
  let s = reduce(initialState, { kind: "permission_request", requestId: "r1", toolName: "Bash", input: {}, toolUseID: "t", canAlways: false });
  s = reduce(s, { kind: "permission_done", requestId: "r1" });
  expect(s.permissions).toEqual([]);
});

test("a state event clears the previous error unless it carries one", () => {
  const err = reduce(initialState, { kind: "error", message: "boom", fatal: false });
  expect(err.error).toBe("boom");
  expect(reduce(err, { kind: "state", state: "running" }).error).toBeNull();
  expect(reduce(err, { kind: "state", state: "crashed", error: "x" }).error).toBe("x");
});
