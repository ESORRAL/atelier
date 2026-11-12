import { describe, expect, it } from "vitest";
import { applyMention, filterCommands, findTrigger } from "./mention";

describe("findTrigger", () => {
  it("detects a command at the start", () => {
    expect(findTrigger("/re", 3)).toEqual({ kind: "command", query: "re", start: 0, end: 3 });
  });
  it("ignores / after text", () => expect(findTrigger("a /re", 5)).toBeNull());
  it("detects @ after a space", () => {
    expect(findTrigger("vois @src/a", 11)).toEqual({ kind: "file", query: "src/a", start: 5, end: 11 });
  });
  it("ignores @ inside a word (email)", () => expect(findTrigger("a@b", 3)).toBeNull());
  it("ignores a finished word", () => expect(findTrigger("@a ", 3)).toBeNull());
});

describe("applyMention", () => {
  it("replaces the word and moves the caret", () => {
    const t = findTrigger("vois @sr suite", 8)!;
    expect(applyMention("vois @sr suite", t, "src/a.ts")).toEqual({ text: "vois @src/a.ts  suite", caret: 15 });
  });
});

describe("filterCommands", () => {
  it("puts prefix matches first and strips slashes", () => {
    expect(filterCommands(["compact", "/review", "init"], "re")).toEqual(["review"]);
    expect(filterCommands(["xcompact", "compact"], "comp")).toEqual(["compact", "xcompact"]);
  });
});
