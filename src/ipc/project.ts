import { invoke } from "@tauri-apps/api/core";

export type GraphSummary = {
  nodes: number;
  edges: number;
  builtAtCommit: string | null;
  headCommit: string | null;
  communities: { id: number; name: string; size: number }[];
  topNodes: { label: string; degree: number; file: string | null; community: string | null }[];
  reportMarkdown: string | null;
};
export type TaskInfo = { id: string; title: string; status: string; agent: string | null; model: string | null; file: string };
export type ProjectInfo = {
  isGit: boolean;
  branch: string | null;
  dirtyFiles: number;
  worktrees: { path: string; branch: string | null; head: string; locked: boolean }[];
  recentCommits: { hash: string; subject: string; date: number }[];
  tasks: TaskInfo[];
};

export const graphSummary = (dir: string) => invoke<GraphSummary | null>("graph_summary", { dir });
export const graphUpdate = (dir: string) => invoke<GraphSummary>("graph_update", { dir });
export const projectInfo = (dir: string) => invoke<ProjectInfo>("project_info", { dir });
export const projectFiles = (dir: string, query: string, limit: number) => invoke<string[]>("project_files", { dir, query, limit });
