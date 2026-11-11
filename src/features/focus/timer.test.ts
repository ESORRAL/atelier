import { describe, expect, it } from "vitest";
import { advance, DEFAULT_STATE, formatRemaining, load, remaining, save, start, stop } from "./timer";

const MIN = 60_000;
describe("focus timer", () => {
  const s = start(DEFAULT_STATE, 1000);
  it("counts down on the wall clock", () => {
    expect(remaining(s, 1000 + 10 * MIN)).toBe(15 * MIN);
    expect(formatRemaining(15 * MIN)).toBe("15:00");
  });
  it("rolls to break then work after a long sleep", () => {
    expect(advance(s, 1000 + 24 * MIN).ended).toBe(0);
    const a = advance(s, 1000 + 26 * MIN);
    expect(a.ended).toBe(1);
    expect(a.state.phase).toBe("break");
    expect(remaining(a.state, 1000 + 26 * MIN)).toBe(4 * MIN);
    const b = advance(s, 1000 + 31 * MIN + 1);
    expect(b.ended).toBe(2);
    expect(b.state.phase).toBe("work");
  });
  it("does nothing when stopped", () => {
    expect(advance(stop(s), 1000 + 99 * MIN).ended).toBe(0);
  });
  it("round-trips through storage and rejects garbage", () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    save(st, { ...s, workMin: 50 });
    expect(load(st)).toEqual({ ...s, workMin: 50 });
    m.set("atelier.focus", "{bad");
    expect(load(st)).toEqual(DEFAULT_STATE);
    m.set("atelier.focus", JSON.stringify({ workMin: -3 }));
    expect(load(st).workMin).toBe(25);
  });
});
