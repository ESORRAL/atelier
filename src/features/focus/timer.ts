export type Phase = "work" | "break";
export type FocusState = {
  active: boolean;
  phase: Phase;
  /** Wall-clock ms (Date.now) when the current phase began. */
  startedAt: number;
  workMin: number;
  breakMin: number;
};

export const DEFAULT_STATE: FocusState = { active: false, phase: "work", startedAt: 0, workMin: 25, breakMin: 5 };

const len = (s: FocusState) => (s.phase === "work" ? s.workMin : s.breakMin) * 60_000;

export function start(s: FocusState, now: number): FocusState {
  return { ...s, active: true, phase: "work", startedAt: now };
}
export const stop = (s: FocusState): FocusState => ({ ...s, active: false });

/** Remaining ms in the current phase (never negative). Based on the wall clock, so it survives sleep. */
export const remaining = (s: FocusState, now: number) => Math.max(0, len(s) - (now - s.startedAt));

/** Rolls over every phase that has elapsed (a long sleep may skip several); `ended` = phases finished. */
export function advance(s: FocusState, now: number): { state: FocusState; ended: number } {
  if (!s.active) return { state: s, ended: 0 };
  let cur = s;
  let ended = 0;
  while (now - cur.startedAt >= len(cur)) {
    cur = { ...cur, phase: cur.phase === "work" ? "break" : "work", startedAt: cur.startedAt + len(cur) };
    ended++;
  }
  return { state: cur, ended };
}

export function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const KEY = "atelier.focus";
export const clampMinutes = (v: unknown, d: number) => (typeof v === "number" && v >= 1 && v <= 180 ? Math.floor(v) : d);

export function load(storage: Pick<Storage, "getItem">): FocusState {
  try {
    const o = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!o || typeof o !== "object") return DEFAULT_STATE;
    return {
      active: o.active === true,
      phase: o.phase === "break" ? "break" : "work",
      startedAt: typeof o.startedAt === "number" ? o.startedAt : 0,
      workMin: clampMinutes(o.workMin, 25),
      breakMin: clampMinutes(o.breakMin, 5),
    };
  } catch {
    return DEFAULT_STATE;
  }
}
export function save(storage: Pick<Storage, "setItem">, s: FocusState) {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: focus just won't survive a restart */
  }
}
