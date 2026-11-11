import { describe, expect, it } from "vitest";
import { back, canGoBack, current, duration, push, togglePreview, type View } from "./browse";

const empty = { artists: [], albums: [], songs: [] };
const v = (kind: View["kind"], title: string): View => ({ kind, title, data: empty });

describe("browse stack", () => {
  it("starts empty", () => {
    expect(current([])).toBeNull();
    expect(canGoBack([])).toBe(false);
  });
  it("pushes and pops", () => {
    const s = push(push([], v("results", "r")), v("artist", "a"));
    expect(current(s)?.title).toBe("a");
    expect(canGoBack(s)).toBe(true);
    expect(current(back(s))?.title).toBe("r");
    expect(canGoBack(back(s))).toBe(false);
  });
});

describe("togglePreview", () => {
  it("starts, replaces and stops", () => {
    expect(togglePreview(null, 1)).toBe(1);
    expect(togglePreview(1, 2)).toBe(2);
    expect(togglePreview(2, 2)).toBeNull();
  });
});

describe("duration", () => {
  it("formats", () => {
    expect(duration(185000)).toBe("3:05");
    expect(duration(null)).toBeNull();
  });
});
