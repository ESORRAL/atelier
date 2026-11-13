// Force layout off the main thread (d3-force costs 9-14 ms per tick for ~1 500 nodes, ~3 s in all).
// Protocol: in {type:"init", n, links: Uint32Array [s0,t0,s1,t1,…]} | {type:"pause"} | {type:"resume"};
// out {type:"tick", pos: Float32Array [x0,y0,…], done} (buffer transferred).
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";

type Msg = { type: "init"; n: number; links: Uint32Array } | { type: "pause" } | { type: "resume" };
const ctx = self as unknown as {
  postMessage(m: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
};

let sim: Simulation<{ index?: number; x?: number; y?: number }> | null = null;

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    sim?.stop();
    const nodes = Array.from({ length: m.n }, () => ({}));
    const links = Array.from({ length: m.links.length / 2 }, (_, i) => ({ source: m.links[2 * i], target: m.links[2 * i + 1] }));
    const post = (done: boolean) => {
      const pos = new Float32Array(2 * nodes.length);
      nodes.forEach((n: { x?: number; y?: number }, i) => {
        pos[2 * i] = n.x ?? 0;
        pos[2 * i + 1] = n.y ?? 0;
      });
      ctx.postMessage({ type: "tick", pos, done }, [pos.buffer]);
    };
    sim = forceSimulation(nodes)
      .force("link", forceLink(links).distance(24).strength(0.4)) // numeric ends = node indexes
      .force("charge", forceManyBody().strength(-40).distanceMax(400))
      .force("x", forceX(0).strength(0.04))
      .force("y", forceY(0).strength(0.04))
      .alphaDecay(0.03)
      .on("tick", () => post(false))
      .on("end", () => post(true));
  } else if (m.type === "pause") sim?.stop();
  else if (sim && sim.alpha() > sim.alphaMin()) sim.restart();
};
