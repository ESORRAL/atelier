import { LockOpen } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Tally } from "./Tally";
import {
  CANCELLED_BANNER_MS,
  formatInput,
  initialState,
  isLocked,
  keyToAction,
  keyUp,
  press,
  pressKey,
  queueCount,
  refocus,
  reveal,
  sync,
  titleFor,
  type Action,
  type Decision,
  type MachineState,
  type PermissionRequest,
} from "./permissionMachine";
import "./PermissionDialog.css";

export type { Decision, PermissionRequest };

export function PermissionHost(props: {
  requests: PermissionRequest[];
  onDecide: (requestId: string, decision: Decision, message: string | null) => void;
  cwd?: string;
}) {
  const { requests, onDecide, cwd } = props;
  const [s, setState] = useState(initialState);
  // Latest machine state, read synchronously so two events in a row never act on a stale copy.
  const sRef = useRef(s);
  sRef.current = s;
  const setS = (next: MachineState | ((prev: MachineState) => MachineState)) => {
    if (typeof next !== "function") sRef.current = next;
    setState(next);
  };
  const [, setTick] = useState(0);
  const [announce, setAnnounce] = useState("");
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<Element | null>(null);
  const countRef = useRef(0);

  const cur = s.current;
  const count = queueCount(s, requests);

  useEffect(() => setS((prev) => sync(prev, requests, performance.now())), [requests]);

  // Cancelled banner: leave it up for 1 s, then let the queue move on.
  useEffect(() => {
    if (s.cancelledAt === null) return;
    const t = setTimeout(() => setS((prev) => sync(prev, requestsRef.current, performance.now())), CANCELLED_BANNER_MS);
    return () => clearTimeout(t);
  }, [s.cancelledAt]);

  // Re-render when the guard ends so buttons look enabled again; the guard itself never decides anything.
  useEffect(() => {
    const left = s.guardUntil - performance.now();
    if (left <= 0) return;
    const t = setTimeout(() => setTick((n) => n + 1), left);
    return () => clearTimeout(t);
  }, [s.guardUntil]);

  useEffect(() => {
    const onFocus = () => setS((prev) => (prev.current ? refocus(prev, performance.now()) : prev));
    const onKeyUp = () => setS(keyUp);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Focus the title on each newly displayed request; restore the origin when the queue empties.
  const curId = cur?.requestId;
  useEffect(() => {
    if (curId) {
      originRef.current ??= document.activeElement;
      titleRef.current?.focus();
    } else if (originRef.current) {
      (originRef.current as HTMLElement).focus?.();
      originRef.current = null;
    }
  }, [curId]);

  // A step change unmounts the focused button: put focus back on the title so it stays in the dialog.
  useEffect(() => {
    titleRef.current?.focus();
  }, [s.step, s.cancelledAt]);

  useEffect(() => {
    if (cur && count > countRef.current && countRef.current > 0) {
      setAnnounce(`Nouvelle demande en attente, 1 sur ${count}`);
    }
    countRef.current = cur ? count : 0;
  }, [cur, count]);

  if (!cur) return null;

  const apply = (r: ReturnType<typeof press>, now: number) => {
    if (r.decision) {
      onDecide(r.decision.requestId, r.decision.decision, null);
      setS(sync(r.state, requests, now));
    } else {
      setS(r.state);
    }
  };
  const act = (action: Action) => {
    const now = performance.now();
    apply(press(sRef.current, action, now), now);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === titleRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (!keyToAction(e.key, e.altKey)) return;
    e.preventDefault();
    const now = performance.now();
    apply(pressKey(sRef.current, e, now), now);
  };

  const locked = isLocked(s, performance.now());
  const cancelled = s.cancelledAt !== null;
  const text = formatInput(cur.toolName, cur.input);
  const scope = cur.toolName === "Bash" ? text : reveal(cur.displayName ?? cur.toolName);
  const btn = (label: string, action: Action, variant: "primary" | "secondary", icon?: boolean) => (
    <button
      type="button"
      className={`permission__btn permission__btn--${variant}`}
      aria-disabled={locked || undefined}
      onClick={() => act(action)}
    >
      {icon && <LockOpen size="var(--icon-sm)" aria-hidden="true" />}
      {label}
    </button>
  );

  return createPortal(
    <div className="permission__scrim">
      <div
        ref={dialogRef}
        className="permission"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        aria-describedby="permission-desc"
        onKeyDown={onKeyDown}
      >
        <header className="permission__head">
          <h2 id="permission-title" ref={titleRef} tabIndex={-1} className="permission__title">
            {titleFor(cur)}
          </h2>
          <span className="permission__count">1 sur {count}</span>
        </header>
        <div className="permission__agent">
          <span>Claude</span>
          <Tally state="waiting-permission" />
        </div>
        <div id="permission-desc">
          <pre className="permission__input">{text}</pre>
          {cwd && <p className="permission__meta">Répertoire de travail : <code>{reveal(cwd)}</code></p>}
          {cur.description && <p className="permission__meta">{reveal(cur.description)}</p>}
          {cur.blockedPath && <p className="permission__meta">Chemin bloqué : {reveal(cur.blockedPath)}</p>}
          {cur.canAlways && (
            <p className="permission__meta">
              « Toujours autoriser » s'applique à <code>{scope}</code> dans ce projet. L'écran Réglages ne permet pas encore de le révoquer.
            </p>
          )}
        </div>
        {cancelled ? (
          <p className="permission__cancelled">Annulée : l'agent a été arrêté</p>
        ) : s.step === "confirm-always" ? (
          <div className="permission__confirm">
            <p>
              Confirmer : toujours autoriser <code>{scope}</code> ici
            </p>
            <div className="permission__actions">
              {btn("Retour", "back", "secondary")}
              {btn("Confirmer", "confirm", "primary")}
            </div>
          </div>
        ) : (
          <div className="permission__actions">
            {btn("Refuser", "deny", "secondary")}
            {cur.canAlways && btn("Toujours autoriser…", "always", "secondary", true)}
            {btn("Autoriser une fois", "allow_once", "primary")}
          </div>
        )}
        <p className="permission__sr" role="status" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>,
    document.body,
  );
}
