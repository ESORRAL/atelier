import type { GraphSummary, ProjectInfo, TaskInfo } from "../../ipc/project";

export const STATUSES = ["todo", "doing", "review", "done", "blocked"] as const;
type Status = (typeof STATUSES)[number];

/** Groups task cards by status column; unknown statuses fall back to todo. Sorted by id. */
export function groupTasks(tasks: TaskInfo[]): Record<Status, TaskInfo[]> {
  const out: Record<Status, TaskInfo[]> = { todo: [], doing: [], review: [], done: [], blocked: [] };
  for (const t of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    out[(STATUSES as readonly string[]).includes(t.status) ? (t.status as Status) : "todo"].push(t);
  }
  return out;
}

export type Freshness = "fresh" | "stale" | "unknown";
export function freshness(g: Pick<GraphSummary, "builtAtCommit" | "headCommit">): Freshness {
  if (!g.builtAtCommit || !g.headCommit) return "unknown";
  return g.builtAtCommit === g.headCommit ? "fresh" : "stale";
}

export type FolderState = "none" | "not-git" | "git";
export const folderState = (dir: string, info: ProjectInfo | null): FolderState =>
  !dir ? "none" : info && !info.isGit ? "not-git" : "git";
