import raw from "../../../spikes/bridge/samples/subagent.ndjson?raw";
import { describe, expect, it } from "vitest";
import { matches, reduceAgents } from "./reduce";

const sample = raw
  .split("\n")
  .filter(Boolean)
  .map((l: string) => JSON.stringify({ kind: "sdk", message: JSON.parse(l).data }));

describe("reduceAgents", () => {
  it("builds one finished card from the real sample", () => {
    const [c, ...rest] = reduceAgents(new Map([["s1", sample]]));
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ type: "general-purpose", task: "Reply with hi", state: "done", tokens: 20772, durationMs: 1128, sessionKey: "s1" });
    expect(c.lastMessage).toBe("hi");
  });
  it("is running before the end events and skips garbage lines", () => {
    const early = sample.filter((l: string) => !l.includes("task_updated") && !l.includes("task_notification"));
    const [c] = reduceAgents(new Map([["s1", ["{truncated", ...early]]]));
    expect(c.state).toBe("running");
    expect(c.lastMessage).toBe("hi");
  });
  it("filters", () => {
    const [c] = reduceAgents(new Map([["s1", sample]]));
    expect(matches(c, "done")).toBe(true);
    expect(matches(c, "failed")).toBe(false);
  });
});
