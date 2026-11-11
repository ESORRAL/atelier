import { describe, expect, it } from "vitest";
import { MAX_TERM, searchTerm, trapIndex } from "./panel";

describe("searchTerm", () => {
  it("trims and accepts a normal term", () => expect(searchTerm("  daft punk ")).toBe("daft punk"));
  it("rejects empty or blank", () => {
    expect(searchTerm("")).toBeNull();
    expect(searchTerm("   ")).toBeNull();
  });
  it("enforces the 200 character limit", () => {
    expect(searchTerm("a".repeat(MAX_TERM))).not.toBeNull();
    expect(searchTerm("a".repeat(MAX_TERM + 1))).toBeNull();
  });
});

describe("trapIndex", () => {
  it("wraps forwards from the last item", () => expect(trapIndex(2, 3, false)).toBe(0));
  it("wraps backwards from the first item or from outside", () => {
    expect(trapIndex(0, 3, true)).toBe(2);
    expect(trapIndex(-1, 3, true)).toBe(2);
  });
  it("leaves middle moves alone", () => {
    expect(trapIndex(1, 3, false)).toBeNull();
    expect(trapIndex(1, 3, true)).toBeNull();
  });
  it("does nothing without items", () => expect(trapIndex(0, 0, false)).toBeNull());
});
