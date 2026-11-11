import { expect, test } from "vitest";
import { canSend, matchModel } from "./logic";

const models = [
  { value: "default", displayName: "Par défaut", resolvedModel: "claude-sonnet-5-5" },
  { value: "haiku", displayName: "Haiku" },
];

test("matchModel matches value or resolvedModel", () => {
  expect(matchModel("claude-sonnet-5-5", models)).toBe("default");
  expect(matchModel("haiku", models)).toBe("haiku");
  expect(matchModel("claude-unknown", models)).toBeNull();
  expect(matchModel(null, models)).toBeNull();
});

test("canSend only when idle with text", () => {
  expect(canSend("idle", " hi ")).toBe(true);
  expect(canSend("idle", "  ")).toBe(false);
  for (const s of ["running", "waiting_permission", "starting", "closed", "crashed", null] as const) expect(canSend(s, "hi")).toBe(false);
});
