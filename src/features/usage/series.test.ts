import { describe, expect, it } from "vitest";
import type { UsageSummary } from "../../ipc/usage";
import { buildSeries, fmtTokens, fmtUsd, isEmpty, OTHERS } from "./series";

const u = (c: number) => ({ costUsd: c, inputTokens: 1000, outputTokens: 500 });
const names = ["a", "b", "c", "d", "e", "f"];
const byModel = Object.fromEntries(names.map((n, i) => [n, u(6 - i)]));
const summary: UsageSummary = {
  totalCostUsd: 21,
  byModel,
  days: [
    { day: "2026-01-01", costUsd: 0, byModel: {} },
    { day: "2026-01-02", costUsd: 21, byModel },
  ],
};

describe("usage series", () => {
  it("formats with fr-FR separators", () => {
    expect(fmtUsd(1234.5).replace(/\s/g, " ")).toBe("1 234,50 $");
    expect(fmtTokens(1234567).replace(/\s/g, " ")).toBe("1 234 567");
  });
  it("folds models beyond five into Autres", () => {
    const s = buildSeries(summary);
    expect(s.models).toEqual(["a", "b", "c", "d", OTHERS]);
    expect(s.bars[1].segs[4]).toEqual({ model: OTHERS, cost: 3 }); // e (2) + f (1)
    expect(s.bars[0].segs).toEqual([]);
    expect(s.max).toBe(21);
  });
  it("detects empty", () => {
    expect(isEmpty({ days: [], totalCostUsd: 0, byModel: {} })).toBe(true);
    expect(isEmpty(summary)).toBe(false);
  });
});
