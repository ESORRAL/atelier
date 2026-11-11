import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Folder, Stop, PaperPlaneRight, Plus } from "@phosphor-icons/react";
import {
  permissionRespond,
  sessionClose,
  sessionHistory,
  sessionInterrupt,
  sessionModels,
  sessionSend,
  sessionSetModel,
  sessionSetPermissionMode,
  sessionsList,
  sessionStart,
  settingsGet,
  type ModelInfo,
  type SessionEntry,
  type SessionEvent,
  type PermissionMode,
  type Settings,
} from "../../ipc/claude";
import { BlackHole } from "../../ui/BlackHole";
import { PermissionHost } from "../../ui/PermissionDialog";
import { MessageView } from "./MessageView";
import { canSend, matchModel } from "./logic";
import { initialState, reduce } from "./reduce";
import "./chat.css";

const STATE_LABEL: Record<string, string> = {
  starting: "Démarrage…",
  idle: "Prêt",
  running: "Claude écrit",
  waiting_permission: "En attente d'une autorisation",
  closed: "Session terminée",
  crashed: "Session interrompue",
};
const MODES: [PermissionMode, string][] = [
  ["default", "Demander à chaque fois"],
  ["acceptEdits", "Accepter les modifications"],
  ["plan", "Plan seulement"],
];
const errText = (e: unknown) => (typeof e === "string" ? e : "Une erreur est survenue.");
const euro = (usd: number) => `${usd.toFixed(4)} $`;

/** What the app shell shows about the current session (right panel). */
export type ChatInfo = { key: string | null; cwd: string; model: string | null; costUsd: number; state: string | null; working: boolean };
/** Imperative actions the shell's command palette can trigger. */
export type ChatControls = { newSession: () => void; interrupt: () => void };

type ChatProps = {
  slot?: HTMLElement | null;
  onInfo?: (info: ChatInfo) => void;
  onEvent?: (e: SessionEvent) => void; // every raw event of the current session
  onSessionReset?: () => void; // a new session is starting: clear any event log
  controlsRef?: RefObject<ChatControls | null>;
};

export default function Chat({ slot, onInfo, onEvent, onSessionReset, controlsRef }: ChatProps) {
  const [s, dispatch] = useReducer(reduce, initialState);
  const [key, setKey] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [chosenModel, setChosenModel] = useState<string | null>(null); // local choice wins over s.model
  const [costBase, setCostBase] = useState(0); // index cost at resume; the SDK total restarts at 0
  const [mode, setMode] = useState<PermissionMode>("default");
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const settings = useRef<Settings | null>(null);
  const keyRef = useRef<string | null>(null);
  const queue = useRef<SessionEvent[]>([]);
  const frame = useRef(0);
  const token = useRef(0); // identifies the current session; stale channels are ignored
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const refresh = useCallback(() => sessionsList().then(setSessions, () => {}), []);
  useEffect(() => {
    settingsGet().then((st) => {
      settings.current = st;
      setRecent(st.recentCwds);
      if (st.recentCwds[0]) setCwd((c) => c || st.recentCwds[0]);
    }, () => {});
    refresh();
    return () => {
      if (keyRef.current) sessionClose(keyRef.current).catch(() => {});
    };
  }, [refresh]);

  // Token buffer flushed at most once per frame (DESIGN.md §5.2).
  const makeOnEvent = useCallback((mine: number) => (e: SessionEvent) => {
    if (mine !== token.current) return;
    onEventRef.current?.(e);
    queue.current.push(e);
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        queue.current.splice(0).forEach(dispatch);
      });
    }
  }, []);

  // Models are loaded as soon as a key exists.
  useEffect(() => {
    // Retried at each state change: the bridge may not answer while still starting.
    if (key && !models.length) sessionModels(key).then(setModels, () => {});
  }, [key, s.sessionState, models.length]);

  // Auto-follow unless the user scrolled up by more than 48 px.
  useEffect(() => {
    const el = log.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [s.messages]);

  const start = async (dir: string, resumeFrom?: SessionEntry) => {
    setLocalError(null);
    setCwd(dir);
    const mine = ++token.current;
    queue.current = [];
    if (keyRef.current) await sessionClose(keyRef.current).catch(() => {});
    keyRef.current = null;
    setKey(null);
    setModels([]);
    setChosenModel(null);
    setCostBase(resumeFrom?.costUsd ?? 0);
    dispatch({ kind: "reset" });
    onSessionReset?.();
    try {
      // Re-read so defaults saved in Réglages apply to this new session.
      settings.current = await settingsGet().catch(() => settings.current);
      if (resumeFrom) {
        const past = await sessionHistory(resumeFrom.key);
        // Pending permission requests of a past session are obsolete.
        past.filter((e) => e.kind === "sdk" || e.kind === "user").forEach(dispatch);
        dispatch({ kind: "zero_cost" });
      }
      const pm = settings.current?.defaultPermissionMode ?? "default";
      setMode(pm);
      const k = await sessionStart(
        dir,
        resumeFrom?.model ?? settings.current?.defaultModel ?? null,
        pm,
        resumeFrom?.claudeSessionId ?? null,
        makeOnEvent(mine),
      );
      if (mine !== token.current) {
        sessionClose(k).catch(() => {}); // a newer start superseded this one
        return;
      }
      keyRef.current = k;
      setKey(k);
      refresh();
    } catch (e) {
      setLocalError(errText(e));
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!key || !canSend(s.sessionState, text)) return;
    setLocalError(null);
    setDraft("");
    follow.current = true;
    sessionSend(key, text).catch((e) => setLocalError(errText(e)));
  };
  const interrupt = () => key && sessionInterrupt(key).catch((e) => setLocalError(errText(e)));
  const newSession = () => {
    token.current++; // stale channels are ignored from now on
    queue.current = [];
    const k = keyRef.current;
    keyRef.current = null;
    setKey(null);
    setModels([]);
    setChosenModel(null);
    setCostBase(0);
    setLocalError(null);
    dispatch({ kind: "reset" });
    onSessionReset?.();
    if (k) sessionClose(k).catch(() => {}).then(refresh);
  };
  if (controlsRef) controlsRef.current = { newSession, interrupt };
  useEffect(() => {
    onInfo?.({ key, cwd, model: s.model, costUsd: costBase + s.costUsd, state: s.sessionState ? STATE_LABEL[s.sessionState] : null, working: s.sessionState === "running" });
  }, [onInfo, key, cwd, s.model, s.costUsd, costBase, s.sessionState]);
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

  const head = (
    <div className="session">
      <span className="session__state">{s.sessionState ? STATE_LABEL[s.sessionState] : "Aucune session"}</span>
      {key && (
        <select
          className="session__model"
          aria-label="Modèle"
          value={modelValue}
          disabled={!models.length}
          onChange={(e) => {
            const v = e.target.value;
            const prev = chosenModel;
            setChosenModel(v);
            sessionSetModel(key, v).catch((x) => {
              setChosenModel(prev);
              setLocalError(errText(x));
            });
          }}
        >
          {modelValue && !models.some((m) => m.value === modelValue) && <option value={modelValue}>{modelValue}</option>}
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.displayName}</option>
          ))}
        </select>
      )}
      {key && (
        <select
          className="session__model"
          aria-label="Mode de permission"
          value={mode}
          onChange={(e) => {
            const prev = mode;
            const v = e.target.value as PermissionMode;
            setMode(v);
            sessionSetPermissionMode(key, v).catch((x) => {
              setMode(prev);
              setLocalError(errText(x));
            });
          }}
        >
          {MODES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      )}
      <span className="session__cost" aria-label="Coût de la session">
        {euro(costBase + s.costUsd)}
      </span>
      {key && (
        <button type="button" className="btn btn--ghost" onClick={newSession}>
          <Plus size="var(--icon-sm)" aria-hidden="true" /> Nouvelle session
        </button>
      )}
    </div>
  );

  return (
    <section className="chat" aria-label="Chat">
      {slot ? createPortal(head, slot) : head}

      {!key ? (
        <div
          className="welcome"
          onPointerMove={(e) => {
            // Pointer position in [-0.5, 0.5], read by CSS for the hero tilt and halo parallax.
            const el = e.currentTarget;
            const r = el.getBoundingClientRect();
            el.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
            el.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
          }}
        >
          <div className="welcome__panel">
            <div className="welcome__hero" aria-hidden="true">
              <BlackHole className="welcome__eclipse" />
              <span className="welcome__letter">A</span>
            </div>
            <h1 className="welcome__title">Sur quel projet <span className="welcome__nowrap">travailles-tu&nbsp;?</span></h1>
            <p className="welcome__lede">Choisis un dossier, Claude ouvrira une session dedans.</p>
            <form
              className="welcome__form"
              onSubmit={(e) => {
                e.preventDefault();
                if (cwd.trim()) start(cwd.trim());
              }}
            >
              <label htmlFor="chat-cwd" className="sr-only">Dossier du projet</label>
              <input id="chat-cwd" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/chemin/vers/le/projet" list="chat-recent" />
              <datalist id="chat-recent">{recent.map((r) => <option key={r} value={r} />)}</datalist>
              <button type="submit" className="btn btn--primary" disabled={!cwd.trim()}>
                Démarrer une session
              </button>
            </form>
            {recent.length > 0 && (
              <ul className="welcome__chips" aria-label="Dossiers récents">
                {recent.map((r) => (
                  <li key={r}>
                    <button type="button" className="chip" onClick={() => setCwd(r)}>
                      <Folder size="var(--icon-sm)" aria-hidden="true" /> {r}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="welcome__h2">Sessions récentes</h2>
            {sessions.length === 0 ? (
              <p className="welcome__empty">Aucune session pour l'instant. Ta première conversation apparaîtra ici.</p>
            ) : (
              <ul className="welcome__sessions">
                {sessions.map((e) => (
                  <li key={e.key}>
                    <button type="button" className="session-row" onClick={() => start(e.cwd, e)}>
                      <span className="session-row__title">{e.title || e.key}</span>
                      <span className="session-row__meta">{e.cwd}</span>
                      <span className="session-row__cost">{euro(e.costUsd)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
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
            <div className="composer">
              <textarea
                aria-label="Message à Claude"
                placeholder="Écris ton message…"
                value={draft}
                rows={1}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && busy) interrupt();
                  else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {busy && (
                <button type="button" className="btn btn--ghost" onClick={interrupt}>
                  <Stop size="var(--icon-sm)" aria-hidden="true" /> Arrêter (Échap)
                </button>
              )}
              <button type="button" className="composer__send" onClick={send} disabled={!canSend(s.sessionState, draft)} aria-label="Envoyer" title="Envoyer (Entrée)">
                <PaperPlaneRight size="var(--icon-md)" weight="fill" aria-hidden="true" />
              </button>
            </div>
            <p className="composer__hint">Entrée pour envoyer, Maj+Entrée pour aller à la ligne</p>
          </div>
        </>
      )}

      {error && <p className="chat__error" role="alert">{error}</p>}
      <div className="sr-only" role="status">{announce}</div>
      <PermissionHost
        requests={s.permissions}
        cwd={cwd}
        onDecide={(requestId, decision, message) => {
          if (!key) return;
          const done = () => dispatch({ kind: "permission_done", requestId });
          if (s.permissions.find((p) => p.requestId === requestId)?.cancelled) return done();
          permissionRespond(key, requestId, decision as "allow_once" | "allow_always" | "deny", message).then(done, (e) =>
            setLocalError(errText(e)),
          );
        }}
      />
    </section>
  );
}
