import type { GraphData } from "../../ipc/project";

export const MAX_NODES = 3000;
export const PALETTE_SIZE = 8; // --color-graph-1..8; smaller communities share the neutral "Autres" color

export type Community = { id: number; name: string; size: number; color: number }; // color: 0..7, or -1 = Autres
export type PNode = { id: string; label: string; file: string | null; community: number; degree: number; r: number; color: number; x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null; index?: number };
export type PLink = { source: PNode | string; target: PNode | string };
export type Prepared = { nodes: PNode[]; links: PLink[]; communities: Community[]; neighbors: Map<string, string[]> };

/** Radius in CSS px from the degree: sqrt so hubs stand out without swallowing the view. */
export const radius = (degree: number) => 2 + Math.min(10, Math.sqrt(degree) * 1.2);

/**
 * Turns `graph_data` into simulation input: keeps the `max` most connected nodes, drops links to missing
 * nodes, colors the 8 largest communities in fixed order (by size), sizes nodes by degree, indexes neighbors.
 */
export function prepare(data: GraphData, max = MAX_NODES): Prepared {
  const kept = data.nodes.length > max ? [...data.nodes].sort((a, b) => b.degree - a.degree).slice(0, max) : data.nodes;
  const sizes = new Map<number, { name: string; size: number }>();
  for (const n of kept) {
    const c = sizes.get(n.community) ?? { name: n.communityName ?? `Communauté ${n.community}`, size: 0 };
    c.size++;
    sizes.set(n.community, c);
  }
  const communities = [...sizes].map(([id, c]) => ({ id, ...c, color: -1 })).sort((a, b) => b.size - a.size || a.id - b.id);
  communities.forEach((c, i) => (c.color = i < PALETTE_SIZE ? i : -1));
  const colorOf = new Map(communities.map((c) => [c.id, c.color]));

  const ids = new Set(kept.map((n) => n.id));
  const links = data.links.filter((l) => l.source !== l.target && ids.has(l.source) && ids.has(l.target));
  const neighbors = new Map<string, string[]>(kept.map((n) => [n.id, []]));
  for (const l of links) {
    neighbors.get(l.source)!.push(l.target);
    neighbors.get(l.target)!.push(l.source);
  }
  const nodes = kept.map((n) => ({ id: n.id, label: n.label, file: n.file, community: n.community, degree: n.degree, r: radius(n.degree), color: colorOf.get(n.community)! }));
  return { nodes, links: links.map((l) => ({ ...l })), communities, neighbors };
}

const fmt = (n: number) => n.toLocaleString("fr-FR");

/** The single status line: « N éléments · M liens · à jour ». */
export function statusLine(nodes: number, links: number, fresh: "fresh" | "stale" | "unknown", truncated: boolean): string {
  const parts = [`${fmt(nodes)} élément${nodes > 1 ? "s" : ""}`, `${fmt(links)} lien${links > 1 ? "s" : ""}`];
  if (fresh !== "unknown") parts.push(fresh === "fresh" ? "à jour" : "en retard");
  if (truncated) parts.push(`${fmt(MAX_NODES)} plus connectés affichés`);
  return parts.join(" · ");
}
