import { describe, expect, it } from "vitest";
import { shortcutAction } from "./shortcuts";

const k = (o: Partial<Parameters<typeof shortcutAction>[0]>) =>
  shortcutAction({ key: "", code: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

describe("shortcuts", () => {
  it("opens the palette with Ctrl+K and Ctrl+P", () => {
    expect(k({ ctrlKey: true, key: "k" })).toEqual({ kind: "palette" });
    expect(k({ ctrlKey: true, key: "p" })).toEqual({ kind: "palette" });
  });
  it("uses the physical digit key (AZERTY gives '&' as key)", () => {
    expect(k({ ctrlKey: true, key: "&", code: "Digit1" })).toEqual({ kind: "tab", index: 0 });
    expect(k({ key: "F3" })).toEqual({ kind: "tab", index: 2 });
  });
  it("toggles the drawer with Ctrl+Backquote or F12", () => {
    expect(k({ ctrlKey: true, code: "Backquote" })).toEqual({ kind: "drawer" });
    expect(k({ key: "F12" })).toEqual({ kind: "drawer" });
  });
  it("ignores Alt, Shift and plain keys", () => {
    expect(k({ ctrlKey: true, altKey: true, key: "k" })).toBeNull();
    expect(k({ ctrlKey: true, shiftKey: true, key: "K" })).toBeNull();
    expect(k({ key: "k" })).toBeNull();
  });
});

it("Ctrl+Shift+F toggles focus", () => {
  expect(k({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true })).toEqual({ kind: "focus" });
});
