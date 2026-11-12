import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../ipc/claude";
import { ancestors, buildRecap, extractWikilinks, joinPath, linkCandidates, relativeDate, resolveLink, treeRows } from "./lib";

describe("vault tree", () => {
  const n = (path: string, title: string) => ({ path, title, modified: 0 });
  const loaded = new Map([
    ["", { folders: ["Zeta", "Alpha"], notes: [n("b.md", "B"), n("a.md", "A")] }],
    ["Alpha", { folders: ["Sub"], notes: [n("Alpha/x.md", "X")] }],
  ]);
  it("lists folders first, sorted, and unfolds only open ones", () => {
    expect(treeRows("", loaded, new Set()).map((r) => r.path)).toEqual(["Alpha", "Zeta", "a.md", "b.md"]);
    const rows = treeRows("", loaded, new Set(["Alpha", "Alpha/Sub"]));
    expect(rows.map((r) => `${r.depth}:${r.path}`)).toEqual(["0:Alpha", "1:Alpha/Sub", "1:Alpha/x.md", "0:Zeta", "0:a.md", "0:b.md"]);
    expect(rows[1]).toMatchObject({ open: true, loading: true });
  });
  it("finds ancestors and joins paths", () => {
    expect(ancestors("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(ancestors("c.md")).toEqual([]);
    expect(joinPath("", "x")).toBe("x");
    expect(joinPath("a", "x")).toBe("a/x");
  });
  it("proposes link candidates next to the note, then at the root", () => {
    expect(linkCandidates("Idée", "Projets/Atelier/Note.md")).toEqual(["Projets/Atelier/Idée.md", "Idée.md"]);
    expect(linkCandidates("Dossier/Note#Titre", "x.md")).toEqual(["Dossier/Note.md"]);
    expect(linkCandidates("../secret", "a/b.md")).toEqual([]);
  });
});

describe("extractWikilinks", () => {
  it("handles plain, aliased and path links", () => {
    const r = extractWikilinks("Voir [[Idée]] et [[Dossier/Note|ce texte]], encore [[Idée]].");
    expect(r.text).toBe("Voir Idée et ce texte, encore Idée.");
    expect(r.links).toEqual([{ target: "Idée", label: "Idée" }, { target: "Dossier/Note", label: "ce texte" }]);
  });
});

describe("resolveLink", () => {
  const notes = [{ path: "a/Note.md", title: "Ma note", modified: 0 }];
  it("matches by path, name or title", () => {
    expect(resolveLink("a/Note", notes)).toBe(notes[0]);
    expect(resolveLink("note", notes)).toBe(notes[0]);
    expect(resolveLink("Ma note", notes)).toBe(notes[0]);
    expect(resolveLink("autre", notes)).toBeUndefined();
  });
});

describe("relativeDate", () => {
  it("is French", () => {
    expect(relativeDate(0, 1_000)).toBe("à l'instant");
    expect(relativeDate(0, 2 * 86_400_000)).toBe("avant-hier");
  });
});

describe("buildRecap", () => {
  const now = new Date(2026, 10, 11, 18).getTime();
  const s = (title: string, updatedAt: number): SessionEntry => ({ key: title, claudeSessionId: null, cwd: "/p", title, model: null, createdAt: 0, updatedAt, costUsd: 1.5 });
  it("lists today's sessions only", () => {
    const usage = { days: [], totalCostUsd: 1.5, byModel: { sonnet: { costUsd: 1.5, inputTokens: 0, outputTokens: 0 } } };
    const md = buildRecap([s("A", now), s("B", now - 3 * 86_400_000)], usage, now);
    expect(md).toContain("## Récap du");
    expect(md).toContain("- A — `/p` — 1.50 $");
    expect(md).not.toContain("- B");
    expect(md).toContain("Modèles : sonnet");
  });
});
