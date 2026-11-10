import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => "0.1.0") }));

import { invoke } from "@tauri-apps/api/core";
import { appVersion } from "./app";

test("appVersion calls the app_version command", async () => {
  expect(await appVersion()).toBe("0.1.0");
  expect(invoke).toHaveBeenCalledWith("app_version");
});
