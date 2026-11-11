import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../ipc/claude";
import { buildRecap, extractWikilinks, relativeDate, resolveLink } from "./lib";

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
