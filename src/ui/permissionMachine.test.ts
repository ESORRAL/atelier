import { describe, expect, it } from "vitest";
import {
  CANCELLED_BANNER_MS,
  GUARD_MS,
  formatInput,
  initialState,
  keyToAction,
  keyUp,
  press,
  pressKey,
  queueCount,
  refocus,
  sync,
  type PermissionRequest,
} from "./permissionMachine";

const req = (id: string, extra: Partial<PermissionRequest> = {}): PermissionRequest => ({
  requestId: id,
  toolName: "Bash",
  input: { command: `echo ${id}` },
  toolUseID: `tu-${id}`,
  canAlways: true,
  ...extra,
});

describe("permission machine", () => {
  it("ignores every action during 500 ms after a request is shown", () => {
    const s = sync(initialState, [req("a")], 1000);
    for (const a of ["deny", "allow_once", "always", "escape"] as const) {
      expect(press(s, a, 1000 + GUARD_MS - 1).decision).toBeUndefined();
    }
    expect(press(s, "allow_once", 1000 + GUARD_MS).decision).toEqual({ requestId: "a", decision: "allow_once" });
  });

  it("re-arms the guard for the next request and after focus returns", () => {
    let s = sync(initialState, [req("a"), req("b")], 0);
    const r = press(s, "deny", GUARD_MS);
    expect(r.decision?.requestId).toBe("a");
    s = sync(r.state, [req("a"), req("b")], 2000);
    expect(s.current?.requestId).toBe("b");
    expect(press(s, "allow_once", 2000 + GUARD_MS - 1).decision).toBeUndefined();
    s = refocus(s, 5000);
    expect(press(s, "allow_once", 5000 + GUARD_MS - 1).decision).toBeUndefined();
    expect(press(s, "allow_once", 5000 + GUARD_MS).decision?.decision).toBe("allow_once");
  });

  it("maps no key to Enter", () => {
    expect(keyToAction("Enter", false)).toBeNull();
    expect(keyToAction("Enter", true)).toBeNull();
    expect(keyToAction("o", false)).toBeNull();
    expect(keyToAction("O", true)).toBe("allow_once");
    expect(keyToAction("t", true)).toBe("always");
    expect(keyToAction("r", true)).toBe("deny");
  });

  it("Escape denies, except at the always confirmation where it goes back", () => {
    const s = sync(initialState, [req("a")], 0);
    expect(press(s, "escape", GUARD_MS).decision?.decision).toBe("deny");
    const c = press(s, "always", GUARD_MS).state;
    expect(c.step).toBe("confirm-always");
    const back = press(c, "escape", 2 * GUARD_MS);
    expect(back.decision).toBeUndefined();
    expect(back.state.step).toBe("ask");
    expect(press(c, "confirm", 2 * GUARD_MS).decision?.decision).toBe("allow_always");
  });

  it("does not offer always when canAlways is false", () => {
    const s = sync(initialState, [req("a", { canAlways: false })], 0);
    expect(press(s, "always", GUARD_MS).state.step).toBe("ask");
    expect(press(s, "confirm", GUARD_MS).decision).toBeUndefined();
  });

  it("never approves a cancelled request and moves on to the next one", () => {
    let s = sync(initialState, [req("a"), req("b")], 0);
    s = sync(s, [req("a", { cancelled: true }), req("b")], 600);
    expect(s.cancelledAt).toBe(600);
    for (const a of ["allow_once", "always", "confirm", "deny"] as const) {
      expect(press(s, a, 1000).decision).toBeUndefined();
    }
    expect(sync(s, [req("a", { cancelled: true }), req("b")], 600 + CANCELLED_BANNER_MS - 1).current?.requestId).toBe("a");
    s = sync(s, [req("a", { cancelled: true }), req("b")], 600 + CANCELLED_BANNER_MS);
    expect(s.current?.requestId).toBe("b");
    expect(press(s, "allow_once", 600 + CANCELLED_BANNER_MS + GUARD_MS - 1).decision).toBeUndefined();
  });

  it("treats a request dropped by the parent as cancelled, and skips already-cancelled ones", () => {
    let s = sync(initialState, [req("a")], 0);
    s = sync(s, [], 600);
    expect(s.current?.cancelled).toBe(true);
    expect(press(s, "allow_once", 700).decision).toBeUndefined();
    s = sync(initialState, [req("x", { cancelled: true }), req("y")], 0);
    expect(s.current?.requestId).toBe("y");
  });

  it("a new request does not replace the displayed one nor re-arm its guard", () => {
    let s = sync(initialState, [req("a")], 0);
    s = sync(s, [req("a"), req("b")], 400);
    expect(s.current?.requestId).toBe("a");
    expect(s.guardUntil).toBe(GUARD_MS);
    expect(queueCount(s, [req("a"), req("b")])).toBe(2);
  });

  it("formats the full tool input as plain text", () => {
    expect(formatInput("Bash", { command: "rm -rf build && npm test" })).toBe("rm -rf build && npm test");
    expect(formatInput("Write", { file_path: "/a/b.ts", content: "x" })).toBe("/a/b.ts");
    expect(formatInput("Grep", { pattern: "<b>" })).toBe('{\n  "pattern": "<b>"\n}');
  });

  it("ignores auto-repeat and keys held since before the request was displayed", () => {
    const altO = { key: "o", altKey: true, repeat: false };
    let s = sync(initialState, [req("a"), req("b")], 0);
    s = keyUp(s);
    const r = pressKey(s, altO, GUARD_MS);
    expect(r.decision?.requestId).toBe("a");
    s = sync(r.state, [req("a"), req("b")], 1000);
    expect(s.current?.requestId).toBe("b");
    // Alt+O still held: repeats, then a fresh press without keyup, after the guard.
    expect(pressKey(s, { ...altO, repeat: true }, 5000).decision).toBeUndefined();
    expect(pressKey(s, altO, 5000).decision).toBeUndefined();
    s = keyUp(s);
    expect(pressKey(s, { ...altO, repeat: true }, 5000).decision).toBeUndefined();
    expect(pressKey(s, altO, 5000).decision?.requestId).toBe("b");
  });

  it("emits at most one decision per request (double click, key + click)", () => {
    const list = [req("a"), req("b")];
    const s = keyUp(sync(initialState, list, 0));
    const first = press(s, "allow_once", GUARD_MS);
    expect(first.decision?.requestId).toBe("a");
    expect(press(first.state, "allow_once", GUARD_MS).decision).toBeUndefined();
    expect(pressKey(first.state, { key: "o", altKey: true, repeat: false }, GUARD_MS).decision).toBeUndefined();
    // Parent has not removed "a" yet: it must not come back, and "b" is guarded.
    const next = sync(first.state, list, GUARD_MS);
    expect(next.current?.requestId).toBe("b");
    expect(press(next, "allow_once", GUARD_MS).decision).toBeUndefined();
    // A stale state still showing "a" but knowing it was decided cannot decide again.
    expect(press({ ...s, done: first.state.done }, "deny", GUARD_MS).decision).toBeUndefined();
  });

  it("reveals bidi, zero-width, control and ANSI characters", () => {
    expect(formatInput("Bash", { command: "echo safe‮;hs.lmx‬" })).toBe("echo safe\\u{202E};hs.lmx\\u{202C}");
    expect(formatInput("Bash", { command: "a​b﻿c⁦d⁩" })).toBe("a\\u{200B}b\\u{FEFF}c\\u{2066}d\\u{2069}");
    expect(formatInput("Bash", { command: "ok\rdel\u001b[2K\u0085\n\tx" })).toBe("ok\\u{D}del\\u{1B}[2K\\u{85}\n\tx");
    expect(formatInput("Edit", { file_path: "/tmp/‮txt.sh" })).toBe("/tmp/\\u{202E}txt.sh");
    expect(formatInput("Grep", { pattern: "‮‏" })).toBe('{\n  "pattern": "\\u{202E}\\u{200F}"\n}');
  });
});
