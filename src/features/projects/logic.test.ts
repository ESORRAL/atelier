import { describe, expect, it } from "vitest";
import { folderState, freshness, groupTasks } from "./logic";
import type { ProjectInfo, TaskInfo } from "../../ipc/project";

const t = (id: string, status: string): TaskInfo => ({ id, title: id, status, agent: null, model: null, file: id });

describe("groupTasks", () => {
  it("groups by status, sorted, unknown goes to todo", () => {
    const g = groupTasks([t("B", "done"), t("A", "done"), t("C", "weird"), t("D", "blocked")]);
    expect(g.done.map((x) => x.id)).toEqual(["A", "B"]);
    expect(g.todo.map((x) => x.id)).toEqual(["C"]);
    expect(g.blocked).toHaveLength(1);
  });
});
describe("freshness", () => {
  it("compares commits", () => {
    expect(freshness({ builtAtCommit: "a", headCommit: "a" })).toBe("fresh");
    expect(freshness({ builtAtCommit: "a", headCommit: "b" })).toBe("stale");
    expect(freshness({ builtAtCommit: null, headCommit: "b" })).toBe("unknown");
  });
});
describe("folderState", () => {
  it("detects states", () => {
    expect(folderState("", null)).toBe("none");
    expect(folderState("/x", { isGit: false } as ProjectInfo)).toBe("not-git");
    expect(folderState("/x", { isGit: true } as ProjectInfo)).toBe("git");
  });
});
