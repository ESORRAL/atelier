import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";
import {
  permissionRespond,
  sessionClose,
  sessionHistory,
  sessionInterrupt,
  sessionModels,
  sessionSend,
  sessionSetModel,
  sessionSetPermissionMode,
  sessionStart,
  settingsGet,
  type ModelInfo,
  type SessionEntry,
  type SessionEvent,
  type PermissionMode,
} from "../../ipc/claude";
import { PermissionHost } from "../../ui/PermissionDialog";
import { MessageView } from "./MessageView";
import { matchModel } from "./logic";
import { Composer } from "./Composer";
import { Menu } from "./Menu";
import { initialState, reduce } from "./reduce";
import { pendingCount, type SessionTab } from "./sessions";
import type { ChatInfo } from "./Chat";

const STATE_LABEL: Record<string, string> = {
  starting: "Démarrage…",
  idle: "Prêt",
  running: "Claude écrit",
  waiting_permission: "En attente d'une autorisation",
  closed: "Session terminée",
  crashed: "Session interrompue",
};
const MODES: [PermissionMode, string][] = [
  ["default", "Manuel"],
  ["acceptEdits", "Accepter les modifs"],
  ["plan", "Plan"],
];
export const errText = (e: unknown) => (typeof e === "string" ? e : "Une erreur est survenue.");

type Props = {
  id: number;
  cwd: string;
  resume: SessionEntry | null;
  firstMessage: string | null; // typed on the welcome screen: sent as soon as the session is ready
  active: boolean; // shown: owns the top-bar slot, the right panel and the permission dialog
  onStatus: (id: number, patch: Partial<Pick<SessionTab, "key" | "title" | "state" | "pending">>) => void;
  onStartError: (id: number, message: string) => void;
  onInfo?: (info: ChatInfo) => void;
  onEvent?: (key: string, e: SessionEvent) => void;
  interruptRef: RefObject<(() => void) | null>;
};

/** One Claude session: its own reducer, channel and permission queue. Stays mounted while hidden. */
export function ChatSession({ id, cwd, resume, firstMessage, active, onStatus, onStartError, onInfo, onEvent, interruptRef }: Props) {
  const [s, dispatch] = useReducer(reduce, initialState);
  const [key, setKey] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [chosenModel, setChosenModel] = useState<string | null>(null); // local choice wins over s.model
  const costBase = resume?.costUsd ?? 0; // index cost at resume; the SDK total restarts at 0
  const [mode, setMode] = useState<PermissionMode>("default");
  const [localError, setLocalError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const early = useRef<SessionEvent[]>([]); // events received before the key is known
  const queue = useRef<SessionEvent[]>([]);
  const frame = useRef(0);
  const alive = useRef(true);
  const started = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Token buffer flushed at most once per frame (DESIGN.md §5.2).
  const handle = useCallback((e: SessionEvent) => {
    if (!alive.current) return;
    if (keyRef.current) onEventRef.current?.(keyRef.current, e);
    else early.current.push(e);
    queue.current.push(e);
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        queue.current.splice(0).forEach(dispatch);
      });
    }
  }, []);

  const start = async () => {
    try {
      // Re-read so defaults saved in Réglages apply to this new session.
      const settings = await settingsGet().catch(() => null);
      if (resume) {
        const past = await sessionHistory(resume.key);
        // Pending permission requests of a past session are obsolete.
        past.filter((e) => e.kind === "sdk" || e.kind === "user").forEach(dispatch);
        dispatch({ kind: "zero_cost" });
      }
      const pm = settings?.defaultPermissionMode ?? "default";
      setMode(pm);
      const k = await sessionStart(cwd, resume?.model ?? settings?.defaultModel ?? null, pm, resume?.claudeSessionId ?? null, handle);
      if (!alive.current) {
        sessionClose(k).catch(() => {}); // the tab was closed while starting
        return;
      }
      keyRef.current = k;
      setKey(k);
      early.current.splice(0).forEach((e) => onEventRef.current?.(k, e));
    } catch (e) {
      if (alive.current) onStartError(id, errText(e));
    }
  };

  // Start once (StrictMode replays effects, refs survive); closing the tab unmounts and closes the session.
  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true;
      start();
    }
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (keyRef.current) sessionClose(keyRef.current).catch(() => {});
    };
  }, []);

  // Models are loaded as soon as a key exists.
  useEffect(() => {
    // Retried at each state change: the bridge may not answer while still starting.
    if (key && !models.length) sessionModels(key).then(setModels, () => {});
  }, [key, s.sessionState, models.length]);

  // Auto-follow unless the user scrolled up by more than 48 px; also when the tab is shown again.
  useEffect(() => {
    const el = log.current;
    if (active && el && follow.current) el.scrollTop = el.scrollHeight;
  }, [s.messages, active]);

  // Shown again: focus goes to the composer, unless a permission dialog takes it.
  const pending = pendingCount(s.permissions);
  const hasPermission = pending > 0;
  useEffect(() => {
    if (active && !hasPermission) input.current?.focus();
  }, [active]);

  const firstUser = s.messages.find((m) => m.role === "user");
  const title = firstUser?.role === "user" ? firstUser.text : undefined;
  useEffect(() => {
    onStatus(id, { key, state: s.sessionState, pending, ...(title ? { title } : {}) });
  }, [onStatus, id, key, s.sessionState, pending, title]);

  const sendText = (text: string) => {
    if (!key) return;
    setLocalError(null);
    follow.current = true;
    sessionSend(key, text).catch((e) => setLocalError(errText(e)));
  };
  const pendingFirst = useRef(firstMessage);
  // The message typed on the welcome screen goes out once, when the bridge first reports idle.
  useEffect(() => {
    if (pendingFirst.current && key && s.sessionState === "idle") {
      const text = pendingFirst.current;
      pendingFirst.current = null;
      sendText(text);
    }
  }, [key, s.sessionState]);
  const interrupt = () => key && sessionInterrupt(key).catch((e) => setLocalError(errText(e)));
  if (active) interruptRef.current = interrupt;

  useEffect(() => {
    if (active) onInfo?.({ key, cwd, model: s.model, costUsd: costBase + s.costUsd, state: s.sessionState ? STATE_LABEL[s.sessionState] : null, working: s.sessionState === "running" });
  }, [active, onInfo, key, cwd, s.model, s.costUsd, costBase, s.sessionState]);
  const busy = s.sessionState === "running" || s.sessionState === "waiting_permission";

  const last = s.messages[s.messages.length - 1];
  const runningTool =
    last?.role === "assistant" ? [...last.blocks].reverse().find((b) => b.type === "tool" && b.status === "running") : undefined;
  const announce =
    s.sessionState === "idle" && last?.role === "assistant" && last.status !== "running"
      ? "Réponse terminée"
      : runningTool?.type === "tool"
        ? `Outil ${runningTool.name} en cours`
        : s.sessionState === "running"
          ? "Claude écrit"
          : "";
  // A new state event ends the previous local error too.
  useEffect(() => setLocalError(null), [s.sessionState]);
  const modelValue = chosenModel ?? matchModel(s.model, models) ?? s.model ?? "";
  const error = localError ?? s.error;

  const bar = (
    <>
      <span className="tmenu__group">
        {key && (
          <Menu
            label="Modèle"
            text={models.find((m) => m.value === modelValue)?.displayName ?? (modelValue || "Modèle")}
            items={models.map((m) => ({ value: m.value, label: m.displayName }))}
            value={modelValue}
            disabled={!models.length}
            onSelect={(v) => {
              const prev = chosenModel;
              setChosenModel(v);
              sessionSetModel(key, v).catch((x) => {
                setChosenModel(prev);
                setLocalError(errText(x));
              });
            }}
          />
        )}
        {key && (
          <Menu
            label="Mode de permission"
            text={MODES.find(([v]) => v === mode)?.[1] ?? ""}
            items={MODES.map(([value, label]) => ({ value, label }))}
            value={mode}
            onSelect={(v) => {
              const prev = mode;
              setMode(v as PermissionMode);
              sessionSetPermissionMode(key, v as PermissionMode).catch((x) => {
                setMode(prev);
                setLocalError(errText(x));
              });
            }}
          />
        )}
      </span>
    </>
  );

  return (
    <div className="chat__session" hidden={!active}>
      <div
        ref={log}
        className="chat__log"
        role="log"
        aria-live="off"
        aria-label="Conversation"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        <div className="chat__column">
          {s.messages.length === 0 && <p className="chat__empty">Dis bonjour à Claude pour commencer.</p>}
          {s.messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
        </div>
      </div>
      <div className="chat__composer">
        <Composer
          id={String(id)}
          cwd={cwd}
          commands={s.commands}
          ready={!!key && s.sessionState === "idle"}
          busy={busy}
          onSend={sendText}
          onInterrupt={interrupt}
          inputRef={input}
          bar={bar}
        />
      </div>

      {error && <p className="chat__error" role="alert">{error}</p>}
      <div className="sr-only" role="status">{announce}</div>
      {/* A hidden session keeps its queue; the dialog appears when its tab is shown (no focus theft). */}
      {active && (
        <PermissionHost
          requests={s.permissions}
          cwd={cwd}
          onDecide={(requestId, decision, message) => {
            if (!key) return;
            const req = s.permissions.find((p) => p.requestId === requestId);
            if (!req) return;
            // Removed before the call: hiding the tab mid-call must not show the request again.
            dispatch({ kind: "permission_done", requestId });
            if (req.cancelled) return;
            permissionRespond(key, requestId, decision as "allow_once" | "allow_always" | "deny", message).catch((e) => {
              dispatch(req); // not answered: back in the queue
              setLocalError(errText(e));
            });
          }}
        />
      )}
    </div>
  );
}
