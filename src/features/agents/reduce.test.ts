import raw from "../../../spikes/bridge/samples/subagent.ndjson?raw";
import { describe, expect, it } from "vitest";
import { applyAgentEvent, durationOf, listAgents, matches, MAX_AGENTS, type AgentStore } from "./reduce";

const sample = raw
  .split("\n")
  .filter(Boolean)
  .map((l: string) => JSON.parse(l).data);

const run = (msgs: unknown[], at = 0) => {
  const store: AgentStore = new Map();
  for (const m of msgs) applyAgentEvent(store, "s1", m as Record<string, unknown>, at);
  return listAgents(store);
};

describe("applyAgentEvent", () => {
  it("builds one finished card from the real sample", () => {
    const [c, ...rest] = run(sample);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ type: "general-purpose", task: "Reply with hi", state: "done", tokens: 20772, durationMs: 1128, sessionKey: "s1" });
    expect(c.lastMessage).toBe("hi");
  });
  it("is running before the end events and ignores garbage", () => {
    const early = sample.filter((m: { subtype?: string }) => m.subtype !== "task_updated" && m.subtype !== "task_notification");
    const [c] = run([null, "x", ...early]);
    expect(c.state).toBe("running");
    expect(c.lastMessage).toBe("hi");
  });
  it("keeps the card after 300 chatty events", () => {
    const store: AgentStore = new Map();
    applyAgentEvent(store, "s1", sample.find((m: { subtype?: string }) => m.subtype === "task_started"));
    for (let i = 0; i < 300; i++) applyAgentEvent(store, "s1", { type: "assistant", message: { content: [{ type: "text", text: `t${i}` }] } });
    expect(listAgents(store)).toHaveLength(1);
  });
  it("caps agents per session, oldest out first", () => {
    const msgs = Array.from({ length: MAX_AGENTS + 1 }, (_, i) => ({ type: "system", subtype: "task_started", task_id: `t${i}` }));
    const cards = run(msgs);
    expect(cards).toHaveLength(MAX_AGENTS);
    expect(cards[0].id).toBe("s1:t1");
  });
  it("shows elapsed time while running only", () => {
    const [c] = run([{ type: "system", subtype: "task_started", task_id: "a" }], 1000);
    expect(durationOf(c, 3500)).toBe(2500);
    expect(durationOf({ ...c, state: "done" }, 3500)).toBeNull();
  });
  it("filters", () => {
    const [c] = run(sample);
    expect(matches(c, "done")).toBe(true);
    expect(matches(c, "failed")).toBe(false);
  });
});
