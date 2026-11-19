import { describe, expect, it } from "vitest";
import type { Settings } from "../../ipc/claude";
import { normalize, validateSettings } from "./validate";

const ok: Settings = { claudePath: null, defaultModel: null, defaultPermissionMode: "default", recentCwds: [], vaultPath: null, vaultProject: "01 - Projets/Atelier" };

describe("validateSettings", () => {
  it("accepts empty and absolute paths", () => {
    expect(validateSettings(ok)).toBeNull();
    expect(validateSettings({ ...ok, claudePath: "" })).toBeNull();
    expect(validateSettings({ ...ok, claudePath: "/usr/bin/claude" })).toBeNull();
  });
  it("rejects relative paths", () => {
    expect(validateSettings({ ...ok, claudePath: "bin/claude" })).not.toBeNull();
  });
  it("rejects modes outside the allowed list", () => {
    expect(validateSettings({ ...ok, defaultPermissionMode: "dontAsk" as never })).not.toBeNull();
    // "Aucune confirmation" is the user's own opt-in (ADR-0002): it is an allowed value.
    expect(validateSettings({ ...ok, defaultPermissionMode: "bypassPermissions" })).toBeNull();
  });
  it("rejects unknown models", () => {
    expect(validateSettings({ ...ok, defaultModel: "gpt" })).not.toBeNull();
  });
  it("normalizes a blank path to null", () => {
    expect(normalize({ ...ok, claudePath: "  " }).claudePath).toBeNull();
  });
});
