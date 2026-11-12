import { describe, expect, it } from "vitest";
import type { GraphData, GraphNode } from "../../ipc/project";
import { prepare, radius, statusLine } from "./prepare";

const node = (id: string, community: number, degree = 1): GraphNode => ({ id, label: id, community, communityName: `c${community}`, file: null, degree });

describe("prepare", () => {
  it("colors the 8 largest communities in size order, the rest is Autres", () => {
    const nodes = Array.from({ length: 10 }, (_, c) => Array.from({ length: 10 - c }, (_, i) => node(`${c}-${i}`, c))).flat();
    const p = prepare({ nodes, links: [], truncated: false });
    expect(p.communities.map((c) => [c.id, c.color])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, -1], [9, -1]]);
    expect(p.nodes.find((n) => n.id === "9-0")!.color).toBe(-1);
  });

  it("caps to the most connected nodes and drops dangling links", () => {
    const data: GraphData = {
      nodes: [node("a", 0, 5), node("b", 0, 1), node("c", 1, 9)],
      links: [{ source: "a", target: "c" }, { source: "a", target: "b" }, { source: "a", target: "a" }],
      truncated: false,
    };
    const p = prepare(data, 2);
    expect(p.nodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect(p.links).toEqual([{ source: "a", target: "c" }]);
    expect(p.neighbors.get("a")).toEqual(["c"]);
    expect(p.neighbors.get("c")).toEqual(["a"]);
  });

  it("sizes by degree, bounded", () => {
    expect(radius(0)).toBe(2);
    expect(radius(100)).toBeGreaterThan(radius(4));
    expect(radius(1e6)).toBe(12);
  });
});

describe("statusLine", () => {
  it("is one short French line", () => {
    expect(statusLine(12, 30, "fresh", false)).toBe("12 éléments · 30 liens · à jour");
    expect(statusLine(1, 2, "stale", false)).toBe("1 élément · 2 liens · en retard");
    expect(statusLine(1, 1, "unknown", true)).toMatch(/^1 élément · 1 lien · 3.000 plus connectés affichés$/);
  });
});
