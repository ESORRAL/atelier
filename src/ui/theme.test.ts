import { describe, expect, it } from "vitest";
import { getTheme, setTheme } from "./theme";

function fakes() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  const attrs = new Map<string, string>();
  const root = {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
  return { storage, root, attrs };
}

describe("theme", () => {
  it("defaults to system", () => {
    expect(getTheme(fakes().storage)).toBe("system");
  });
  it("persists and applies a forced theme", () => {
    const { storage, root, attrs } = fakes();
    setTheme("light", storage, root);
    expect(getTheme(storage)).toBe("light");
    expect(attrs.get("data-theme")).toBe("light");
  });
  it("system clears the override", () => {
    const { storage, root, attrs } = fakes();
    setTheme("dark", storage, root);
    setTheme("system", storage, root);
    expect(getTheme(storage)).toBe("system");
    expect(attrs.has("data-theme")).toBe(false);
  });
  it("ignores garbage values", () => {
    const { storage } = fakes();
    storage.setItem("atelier.theme", "pink");
    expect(getTheme(storage)).toBe("system");
  });
});
