import { expect, test } from "vitest";
import type { SessionEntry } from "../../ipc/claude";
import {
  closeTab,
  cycleStep,
  cycleTab,
  folderName,
  logEvent,
  LOG_MAX,
  MAX_TABS,
  noTabs,
  openTab,
  pendingCount,
  patchTab,
  selectTab,
  tallyOf,
  type SessionEventLog,
  type SessionTabs,
} from "./sessions";

const entry: SessionEntry = { key: "k1", claudeSessionId: "c1", cwd: "/p/a", title: "Bonjour", model: null, createdAt: 0, updatedAt: 0, costUsd: 0.1 };
const three = () => [ "/p/a", "/p/b", "/p/c" ].reduce<SessionTabs>((t, d) => openTab(t, d)!, noTabs);

test("openTab adds, selects and titles a tab with its folder or the resumed title", () => {
  const t = openTab(noTabs, "/home/me/projet/")!;
  expect(t.list).toHaveLength(1);
  expect(t.active).toBe(t.list[0].id);
  expect(t.list[0].title).toBe("projet");
  expect(openTab(t, "/p/a", entry)!.list[1].title).toBe("Bonjour");
});

test("openTab refuses a ninth tab", () => {
  let t = noTabs;
  for (let i = 0; i < MAX_TABS; i++) t = openTab(t, `/p/${i}`)!;
  expect(openTab(t, "/p/x")).toBeNull();
});

test("resuming a session already open selects its tab, even before its key is known", () => {
  const t = openTab(openTab(noTabs, "/p/a", entry)!, "/p/b")!;
  const again = openTab(t, "/p/a", entry)!;
  expect(again.list).toHaveLength(2);
  expect(again.active).toBe(t.list[0].id);
  const keyed = patchTab(openTab(noTabs, "/p/a")!, 1, { key: "k1" });
  expect(openTab(keyed, "/p/a", entry)!.list).toHaveLength(1);
});

test("closeTab shows the right neighbour, then the left one, then the welcome screen", () => {
  let t = selectTab(three(), 2);
  t = closeTab(t, 2);
  expect(t.list.map((x) => x.id)).toEqual([1, 3]);
  expect(t.active).toBe(3);
  t = closeTab(t, 3);
  expect(t.active).toBe(1);
  t = closeTab(t, 1);
  expect(t.active).toBeNull();
  expect(closeTab(t, 42)).toBe(t);
});

test("closing a hidden tab keeps the shown one", () => {
  expect(closeTab(selectTab(three(), 1), 3).active).toBe(1);
});

test("cycleTab wraps both ways and starts from the welcome screen", () => {
  const t = three();
  expect(cycleTab(t, 1).active).toBe(1);
  expect(cycleTab(selectTab(t, 1), -1).active).toBe(3);
  expect(cycleTab(selectTab(t, null), 1).active).toBe(1);
  expect(cycleTab(selectTab(t, null), -1).active).toBe(3);
  expect(cycleTab(noTabs, 1)).toBe(noTabs);
});

test("selectTab ignores an unknown id", () => {
  const t = three();
  expect(selectTab(t, 99)).toBe(t);
});

test("patchTab returns the same table when nothing changes", () => {
  const t = three();
  expect(patchTab(t, 1, { state: null, pending: 0 })).toBe(t);
  expect(patchTab(t, 1, { state: "running" }).list[0].state).toBe("running");
});

test("tallyOf flags a pending permission first", () => {
  expect(tallyOf({ state: "running", pending: 1 })).toBe("waiting-permission");
  expect(tallyOf({ state: "waiting_permission", pending: 0 })).toBe("waiting-permission");
  expect(tallyOf({ state: "running", pending: 0 })).toBe("running");
  expect(tallyOf({ state: "idle", pending: 0 })).toBe("done");
  expect(tallyOf({ state: "crashed", pending: 0 })).toBe("failed");
  expect(tallyOf({ state: null, pending: 0 })).toBe("queued");
});

test("pendingCount ignores cancelled requests", () => {
  expect(pendingCount([{ cancelled: true }, {}, { cancelled: false }])).toBe(2);
  expect(pendingCount([{ cancelled: true }])).toBe(0);
});

test("cycleStep reads Ctrl+Tab and Ctrl+Maj+Tab only", () => {
  const k = { code: "Tab", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
  expect(cycleStep(k)).toBe(1);
  expect(cycleStep({ ...k, shiftKey: true })).toBe(-1);
  expect(cycleStep({ ...k, ctrlKey: false })).toBe(0);
  expect(cycleStep({ ...k, altKey: true })).toBe(0);
});

test("logEvent keeps the last events per key, truncating long lines", () => {
  const log: SessionEventLog = new Map();
  for (let i = 0; i < LOG_MAX + 5; i++) logEvent(log, "a", { kind: "user", text: String(i) });
  logEvent(log, "b", { kind: "user", text: "x".repeat(5000) });
  expect(log.get("a")).toHaveLength(LOG_MAX);
  expect(log.get("a")![0]).toContain('"5"');
  expect(log.get("b")![0].endsWith("…")).toBe(true);
});

test("folderName", () => {
  expect(folderName("/a/b")).toBe("b");
  expect(folderName("/")).toBe("/");
});
