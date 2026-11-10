import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
  Channel: class {
    onmessage: unknown;
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { permissionRespond, sessionStart, sessionsList } from "./claude";

test("sessionStart passes camelCase arguments and a channel", async () => {
  await sessionStart("/p", null, "default", "abc", () => {});
  const [cmd, args] = vi.mocked(invoke).mock.calls[0];
  expect(cmd).toBe("session_start");
  expect(args).toMatchObject({ cwd: "/p", model: null, permissionMode: "default", resume: "abc" });
  expect(args).toHaveProperty("onEvent");
});

test("permissionRespond and sessionsList use the contract names", async () => {
  await permissionRespond("k", "r1", "deny", null);
  expect(invoke).toHaveBeenCalledWith("permission_respond", { key: "k", requestId: "r1", decision: "deny", message: null });
  await sessionsList();
  expect(invoke).toHaveBeenCalledWith("sessions_list");
});
