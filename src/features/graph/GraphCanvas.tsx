import { useEffect, useRef, useState } from "react";
import { PALETTE_SIZE, type PNode, type Prepared } from "./prepare";

type View = { x: number; y: number; k: number }; // screen = world * k + (x, y), CSS px
const K_MIN = 0.05;
const K_MAX = 8;
const CLICK_SLOP = 4; // px of movement under which a press is a click, not a pan

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

type Colors = { palette: string[]; other: string; surface: string; link: string; strong: string; accent: string };
const readColors = (el: Element): Colors => ({
  palette: Array.from({ length: PALETTE_SIZE }, (_, i) => cssVar(el, `--color-graph-${i + 1}`)),
  other: cssVar(el, "--color-text-muted"),
  surface: cssVar(el, "--color-bg-surface"),
  link: cssVar(el, "--color-chart-grid"),
  strong: cssVar(el, "--color-text-secondary"),
  accent: cssVar(el, "--color-focus-ring"),
});

/** Draws the graph on a canvas; a worker lays it out (d3-force), then stops. Wheel zooms, drag pans, click selects. */
export function GraphCanvas({ p, selected, onSelect, label, centerOn }: {
  p: Prepared;
  selected: string | null;
  onSelect: (id: string | null) => void;
  label: string;
  centerOn: { id: string } | null; // new object = recenter request
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const moved = useRef(false); // the user took control of the view: stop auto-fitting
  const hoverRef = useRef<PNode | null>(null);
  const selRef = useRef(selected);
  const frame = useRef(0);
  const [hover, setHover] = useState<string | null>(null); // label of the hovered node
  const tip = useRef<HTMLDivElement>(null);
  const byId = useRef(new Map<string, PNode>());
  const colors = useRef<Colors | null>(null); // read once, not 14 getComputedStyle calls per frame

  const draw = () => {
    frame.current = 0;
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    // Colors come from the tokens; the cache is dropped when the theme changes (see the effect below).
    colors.current ??= readColors(c);
    const { palette, other, surface, link: linkColor, strong, accent } = colors.current;
    const { x, y, k } = view.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);

    const sel = selRef.current ? byId.current.get(selRef.current) : undefined;
    const near = sel ? new Set(p.neighbors.get(sel.id)) : null;
    const hov = hoverRef.current;

    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = linkColor;
    ctx.globalAlpha = sel ? 0.35 : 1;
    ctx.beginPath();
    for (const l of p.links) {
      const s = p.nodes[l.source];
      const t = p.nodes[l.target];
      ctx.moveTo(s.x!, s.y!);
      ctx.lineTo(t.x!, t.y!);
    }
    ctx.stroke();

    const focus = sel ?? hov;
    if (focus) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = strong;
      ctx.lineWidth = 1.5 / k;
      ctx.beginPath();
      for (const l of p.links) {
        const s = p.nodes[l.source];
        const t = p.nodes[l.target];
        if (s === focus || t === focus) {
          ctx.moveTo(s.x!, s.y!);
          ctx.lineTo(t.x!, t.y!);
        }
      }
      ctx.stroke();
    }

    // One path per color keeps 3 000 nodes cheap; a thin surface ring separates overlapping dots.
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = surface;
    for (let ci = -1; ci < PALETTE_SIZE; ci++) {
      for (const dim of sel ? [true, false] : [false]) {
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fillStyle = ci < 0 ? other : palette[ci];
        ctx.beginPath();
        for (const n of p.nodes) {
          if (n.color !== ci) continue;
          if (sel && dim === (n === sel || near!.has(n.id))) continue;
          ctx.moveTo(n.x! + n.r, n.y!);
          ctx.arc(n.x!, n.y!, n.r, 0, 2 * Math.PI);
        }
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (focus) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 / k;
      ctx.beginPath();
      ctx.arc(focus.x!, focus.y!, focus.r + 3 / k, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  const fit = () => {
    const c = canvas.current;
    if (!c || p.nodes.length === 0) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of p.nodes) {
      x0 = Math.min(x0, n.x!); y0 = Math.min(y0, n.y!);
      x1 = Math.max(x1, n.x!); y1 = Math.max(y1, n.y!);
    }
    const pad = 24;
    const k = Math.max(K_MIN, Math.min(2, (c.clientWidth - 2 * pad) / (x1 - x0 || 1), (c.clientHeight - 2 * pad) / (y1 - y0 || 1)));
    view.current = { k, x: c.clientWidth / 2 - ((x0 + x1) / 2) * k, y: c.clientHeight / 2 - ((y0 + y1) / 2) * k };
  };

  // Layout: runs in a worker, once per data set; it settles (alpha decays) then stops by itself.
  // The main thread only copies positions and draws.
  useEffect(() => {
    byId.current = new Map(p.nodes.map((n) => [n.id, n]));
    moved.current = false;
    const worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ pos: Float32Array }>) => {
      const pos = e.data.pos;
      for (let i = 0; i < p.nodes.length; i++) {
        p.nodes[i].x = pos[2 * i];
        p.nodes[i].y = pos[2 * i + 1];
      }
      if (!moved.current) fit();
      schedule();
    };
    const links = new Uint32Array(2 * p.links.length);
    p.links.forEach((l, i) => {
      links[2 * i] = l.source;
      links[2 * i + 1] = l.target;
    });
    worker.postMessage({ type: "init", n: p.nodes.length, links });
    // Pause while the window is hidden or inactive; the worker resumes only if the layout had not settled.
    const pause = () => worker.postMessage({ type: "pause" });
    const resume = () => document.visibilityState === "visible" && worker.postMessage({ type: "resume" });
    const onVis = () => (document.visibilityState === "hidden" ? pause() : resume());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    if (!document.hasFocus()) pause();
    return () => {
      worker.terminate();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  useEffect(() => {
    selRef.current = selected;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const n = centerOn && byId.current.get(centerOn.id);
    const c = canvas.current;
    if (!n || !c) return;
    moved.current = true;
    const k = Math.max(view.current.k, 1);
    view.current = { k, x: c.clientWidth / 2 - n.x! * k, y: c.clientHeight / 2 - n.y! * k };
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOn]);

  // Theme change: re-read the token colors on the next frame.
  useEffect(() => {
    const drop = () => {
      colors.current = null;
      schedule();
    };
    const mo = new MutationObserver(drop);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", drop);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw on resize; wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const c = canvas.current!;
    const ro = new ResizeObserver(() => {
      if (!moved.current) fit();
      schedule();
    });
    ro.observe(c);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      c.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = (sx: number, sy: number, f: number) => {
    const v = view.current;
    const k = Math.min(K_MAX, Math.max(K_MIN, v.k * f));
    view.current = { k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k };
    moved.current = true;
    hoverRef.current = null;
    setHover(null);
    schedule();
  };
  const pan = (dx: number, dy: number) => {
    view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy };
    moved.current = true;
    schedule();
  };
  const nodeAt = (sx: number, sy: number) => {
    const { x, y, k } = view.current;
    // Nearest node within its (screen) hit radius; a plain scan is ~1 ms for 3 000 nodes.
    let best: PNode | undefined;
    let bestD = Infinity;
    for (const n of p.nodes) {
      if (n.x === undefined) continue;
      const d = Math.hypot(n.x * k + x - sx, n.y! * k + y - sy);
      if (d <= Math.max(n.r * k, 6) + 2 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  const drag = useRef<{ x: number; y: number; dist: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="graph__stage">
      <canvas
        ref={canvas}
        className="graph__canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="graphe"
        aria-label={label}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, dist: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            d.dist += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
            if (d.dist > CLICK_SLOP) pan(e.clientX - d.x, e.clientY - d.y);
            d.x = e.clientX;
            d.y = e.clientY;
            return;
          }
          const [sx, sy] = local(e);
          const n = nodeAt(sx, sy) ?? null;
          if (n !== hoverRef.current) {
            hoverRef.current = n;
            setHover(n ? n.label : null); // re-render only when the hovered node changes
            schedule();
          }
          // The tooltip follows the pointer straight in the DOM, no re-render per move.
          if (tip.current) tip.current.style.transform = `translate(${sx}px, ${sy}px)`;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.dist > CLICK_SLOP) return;
          const [sx, sy] = local(e);
          onSelect(nodeAt(sx, sy)?.id ?? null);
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
          setHover(null);
          schedule();
        }}
        onKeyDown={(e) => {
          const c = e.currentTarget;
          const step = 48;
          const zoomIn = () => zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1.25);
          const zoomOut = () => zoomAt(c.clientWidth / 2, c.clientHeight / 2, 0.8);
          const reset = () => {
            moved.current = false;
            fit();
            schedule();
          };
          // Digits and punctuation by event.code (DESIGN.md §8.6), so they work on any keyboard layout.
          const actions: Record<string, () => void> = {
            ArrowLeft: () => pan(step, 0),
            ArrowRight: () => pan(-step, 0),
            ArrowUp: () => pan(0, step),
            ArrowDown: () => pan(0, -step),
            Equal: zoomIn,
            NumpadAdd: zoomIn,
            Minus: zoomOut,
            NumpadSubtract: zoomOut,
            Digit0: reset,
            Numpad0: reset,
            Escape: () => onSelect(null),
          };
          const a = actions[e.code] ?? actions[e.key];
          if (a) {
            e.preventDefault();
            a();
          }
        }}
      />
      {hover && (
        <div ref={tip} className="graph__tip" aria-hidden="true">
          {hover}
        </div>
      )}
    </div>
  );
}
