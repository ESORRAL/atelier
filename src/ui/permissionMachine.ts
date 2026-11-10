// Pure state machine of the permission dialog (DESIGN.md §5.1). Time is always passed in, never read.

export type Decision = "allow_once" | "allow_always" | "deny";

// `permission_request` event of contracts/ipc.md §2 without `kind`, plus `cancelled`.
export type PermissionRequest = {
  requestId: string;
  toolName: string;
  input: unknown;
  toolUseID: string;
  displayName?: string;
  description?: string;
  blockedPath?: string;
  canAlways: boolean;
  cancelled?: boolean;
};

export type Step = "ask" | "confirm-always";
export type Action = "deny" | "allow_once" | "always" | "confirm" | "back" | "escape";

export type MachineState = {
  current: PermissionRequest | null; // snapshot, kept even if the parent drops it from the list
  step: Step;
  guardUntil: number;
  cancelledAt: number | null; // set when the displayed request got cancelled
  done: ReadonlySet<string>; // decided or dismissed ids, never shown again
};

export const GUARD_MS = 500;
export const CANCELLED_BANNER_MS = 1000;

export const initialState: MachineState = {
  current: null,
  step: "ask",
  guardUntil: 0,
  cancelledAt: null,
  done: new Set(),
};

const isPending = (s: MachineState, r: PermissionRequest) => !r.cancelled && !s.done.has(r.requestId);

/** Reconciles the machine with the parent's queue. Never replaces a request still on screen. */
export function sync(s: MachineState, requests: PermissionRequest[], now: number): MachineState {
  if (s.current) {
    const fresh = requests.find((r) => r.requestId === s.current!.requestId);
    // Gone from the queue without our decision: treat as cancelled, it must never be approvable.
    const cancelled = !fresh || !!fresh.cancelled;
    if (!cancelled) return fresh === s.current ? s : { ...s, current: fresh };
    if (s.cancelledAt === null) return { ...s, current: { ...s.current, cancelled: true }, step: "ask", cancelledAt: now };
    if (now < s.cancelledAt + CANCELLED_BANNER_MS) return s;
    s = { ...s, done: new Set(s.done).add(s.current.requestId), current: null, cancelledAt: null };
  }
  const next = requests.find((r) => isPending(s, r)) ?? null;
  if (!next) return s.current === null ? s : { ...s, current: null };
  return { ...s, current: next, step: "ask", guardUntil: now + GUARD_MS, cancelledAt: null };
}

/** Window or dialog regained focus: re-arm the guard. */
export const refocus = (s: MachineState, now: number): MachineState => ({ ...s, guardUntil: now + GUARD_MS });

export const isGuarded = (s: MachineState, now: number) => now < s.guardUntil;

export const isLocked = (s: MachineState, now: number) => !s.current || s.cancelledAt !== null || isGuarded(s, now);

/** Applies a user action. Returns the decision to emit, if any; the caller then runs `sync`. */
export function press(
  s: MachineState,
  action: Action,
  now: number,
): { state: MachineState; decision?: { requestId: string; decision: Decision } } {
  const cur = s.current;
  if (!cur || isLocked(s, now)) return { state: s };
  const rearm = (step: Step) => ({ state: { ...s, step, guardUntil: now + GUARD_MS } });
  const decide = (decision: Decision) => ({
    state: { ...s, current: null, step: "ask" as Step, done: new Set(s.done).add(cur.requestId) },
    decision: { requestId: cur.requestId, decision },
  });
  if (s.step === "confirm-always") {
    if (action === "confirm") return decide("allow_always");
    if (action === "back" || action === "escape") return rearm("ask");
    return { state: s };
  }
  if (action === "deny" || action === "escape") return decide("deny");
  if (action === "allow_once") return decide("allow_once");
  if (action === "always" && cur.canAlways) return rearm("confirm-always");
  return { state: s };
}

/** Keyboard shortcuts (letters via event.key). Enter is deliberately absent. */
export function keyToAction(key: string, altKey: boolean): Action | null {
  if (key === "Escape") return "escape";
  if (!altKey) return null;
  return ({ o: "allow_once", t: "always", r: "deny" } as Record<string, Action>)[key.toLowerCase()] ?? null;
}

/** Position "1 sur N": the displayed request plus the pending ones behind it. */
export function queueCount(s: MachineState, requests: PermissionRequest[]): number {
  const id = s.current?.requestId;
  return (s.current ? 1 : 0) + requests.filter((r) => r.requestId !== id && isPending(s, r)).length;
}

/** Full tool input as plain text: whole command for Bash, path for Write/Edit, indented JSON otherwise. */
export function formatInput(toolName: string, input: unknown): string {
  const obj = (input ?? {}) as Record<string, unknown>;
  if (toolName === "Bash" && typeof obj.command === "string") return obj.command;
  if ((toolName === "Write" || toolName === "Edit") && typeof obj.file_path === "string") return obj.file_path;
  return JSON.stringify(input, null, 2) ?? String(input);
}

export function titleFor(r: PermissionRequest): string {
  if (r.toolName === "Bash") return "Claude veut exécuter une commande";
  if (r.toolName === "Write") return "Claude veut écrire un fichier";
  if (r.toolName === "Edit") return "Claude veut modifier un fichier";
  return `Claude veut utiliser l'outil ${r.displayName ?? r.toolName}`;
}
