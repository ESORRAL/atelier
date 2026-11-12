// Minimal typings for the parts of d3-force we use (the package ships none; @types/d3-force is not allowed by the card).
declare module "d3-force" {
  export interface SimulationNode { index?: number; x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }
  export interface Simulation<N> {
    alpha(): number;
    alpha(a: number): this;
    alphaMin(): number;
    alphaDecay(d: number): this;
    restart(): this;
    stop(): this;
    force(name: string, force: unknown): this;
    find(x: number, y: number, radius?: number): N | undefined;
    on(type: "tick" | "end", listener: (() => void) | null): this;
  }
  export function forceSimulation<N extends SimulationNode>(nodes?: N[]): Simulation<N>;
  export interface LinkForce<N, L> {
    id(fn: (n: N) => string): this;
    distance(d: number): this;
    strength(s: number): this;
    links(): L[];
  }
  export function forceLink<N, L>(links?: L[]): LinkForce<N, L>;
  export interface ManyBodyForce { strength(s: number): this; distanceMax(d: number): this }
  export function forceManyBody(): ManyBodyForce;
  export interface PositionForce { strength(s: number): this }
  export function forceX(x?: number): PositionForce;
  export function forceY(y?: number): PositionForce;
}
