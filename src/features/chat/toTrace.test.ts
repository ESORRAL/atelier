import { expect, test } from "vitest";
import alwaysRaw from "../../../spikes/bridge/samples/always.ndjson?raw";
import permissionRaw from "../../../spikes/bridge/samples/permission.ndjson?raw";
import subagentRaw from "../../../spikes/bridge/samples/subagent.ndjson?raw";
import { initialState, reduce, type ChatMessage, type ChatState } from "./reduce";
import { diffRows, stripLineNumbers, toolNode, toPhases } from "./toTrace";

const events = (raw: string) =>
  raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => l.kind === "message" && l.data?.type)
    .map((l) => ({ kind: "sdk" as const, message: l.data }));
const assistants = (s: ChatState) => s.messages.filter((m): m is Extract<ChatMessage, { role: "assistant" }> => m.role === "assistant");
const nodes = (raw: string) => assistants(events(raw).reduce(reduce, initialState)).flatMap((m) => toPhases(m).flatMap((p) => p.trace));

test("Bash sample → terminal node with its output", () => {
  const bash = nodes(alwaysRaw).find((n) => n.type === "terminal");
  expect(bash).toMatchObject({ command: "touch always.txt", output: "(Bash completed with no output)", exitCode: 0, status: "completed" });
});

test("refused Write sample → failed write_file node", () => {
  const writes = nodes(permissionRaw).filter((n) => n.toolName === "write_file");
  expect(writes[0]).toMatchObject({ status: "failed", args: { content: "hi" } });
  expect(writes[0].args.path).toMatch(/permission\.txt$/);
});

test("subagent sample → reasoning with real duration, then an agent node", () => {
  const n = nodes(subagentRaw);
  const thought = n.find((x) => x.type === "reasoning");
  expect(thought?.sentences).toEqual([]); // empty SDK thinking: chip only
  expect(thought?.durationSeconds).toBeGreaterThan(0);
  expect(n.find((x) => x.toolName === "agent")).toMatchObject({ args: { description: "Reply with hi" }, status: "completed" });
});

test("Read, Edit, failed Bash, mcp and unknown tools", () => {
  const tool = (name: string, input: object, extra: object = {}) =>
    toolNode({ type: "tool", id: "t", name, input, status: "done", ...extra });
  expect(tool("Read", { file_path: "/a/b.ts" }, { result: "    10\tconst a = 1;\n    11\tconst b = 2;" })).toMatchObject({
    toolName: "read_file",
    args: { path: "/a/b.ts" },
    code: "const a = 1;\nconst b = 2;",
    lineStart: 10,
  });
  expect(tool("Edit", { file_path: "x.ts", old_string: "a\nb\nc", new_string: "a\nB\nc" })).toMatchObject({
    toolName: "edit_file",
    add: 1,
    del: 1,
    diffRows: [{ type: "ctx", text: "a" }, { type: "del", text: "b" }, { type: "add", text: "B" }, { type: "ctx", text: "c" }],
  });
  expect(tool("Bash", { command: "false" }, { status: "failed", result: "Exit code 1" })).toMatchObject({ exitCode: 1, status: "failed" });
  expect(tool("mcp__srv__do", { q: 1 }).toolName).toBe("mcp");
  expect(tool("TodoWrite", {}).toolName).toBe("TodoWrite");
});

test("phases: tools then prose; live thinking is a running reasoning node", () => {
  const phases = toPhases({
    blocks: [
      { type: "text", text: "Je regarde." },
      { type: "tool", id: "1", name: "Grep", input: { pattern: "x" }, status: "done", result: "a.ts" },
      { type: "text", text: "Trouvé." },
    ],
    live: { kind: "thinking", text: "" },
  });
  expect(phases.map((p) => [p.trace.length, p.message])).toEqual([[0, "Je regarde."], [1, "Trouvé."], [1, undefined]]);
  expect(phases[2].trace[0]).toMatchObject({ type: "reasoning", status: "running" });
});

test("helpers on edge cases", () => {
  expect(stripLineNumbers("no numbers")).toEqual({ code: "no numbers", lineStart: 1 });
  expect(diffRows("same", "same")).toMatchObject({ add: 0, del: 0 });
  expect(diffRows("", "new")).toMatchObject({ add: 1, del: 0 }); // empty old_string adds no deleted line
});
