import { describe, expect, it } from "vitest";
import { initialIndex, insertAt, menuKey } from "./menu";

describe("menuKey", () => {
  it("wraps arrows and jumps with Home/End", () => {
    expect(menuKey("ArrowDown", 2, 3)).toEqual({ index: 0 });
    expect(menuKey("ArrowUp", 0, 3)).toEqual({ index: 2 });
    expect(menuKey("Home", 2, 3)).toEqual({ index: 0 });
    expect(menuKey("End", 0, 3)).toEqual({ index: 2 });
  });
  it("selects, closes, ignores the rest", () => {
    expect(menuKey("Enter", 1, 3)).toBe("select");
    expect(menuKey(" ", 1, 3)).toBe("select");
    expect(menuKey("Escape", 1, 3)).toBe("close");
    expect(menuKey("a", 1, 3)).toBeNull();
    expect(menuKey("ArrowDown", 0, 0)).toBeNull();
  });
});
describe("initialIndex / insertAt", () => {
  it("falls back to the first item", () => {
    expect(initialIndex(["a", "b"], "b")).toBe(1);
    expect(initialIndex(["a", "b"], "z")).toBe(0);
    expect(initialIndex(["a"], null)).toBe(0);
  });
  it("adds a space only when glued to a word", () => {
    expect(insertAt("", 0)).toEqual({ text: "@", caret: 1 });
    expect(insertAt("lis ", 4)).toEqual({ text: "lis @", caret: 5 });
    expect(insertAt("lis", 3)).toEqual({ text: "lis @", caret: 5 });
  });
});
