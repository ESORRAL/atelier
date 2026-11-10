import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, Stop, PaperPlaneRight } from "@phosphor-icons/react";
import {
  permissionRespond,
  sessionClose,
  sessionHistory,
  sessionInterrupt,
  sessionModels,
  sessionSend,
  sessionSetModel,
  sessionsList,
  sessionStart,
  settingsGet,
  type ModelInfo,
  type SessionEntry,
  type SessionEvent,
  type Settings,
} from "../../ipc/claude";
import { PermissionHost } from "../../ui/PermissionDialog";
import { MessageView } from "./MessageView";
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
const errText = (e: unknown) => (typeof e === "string" ? e : "Une erreur est survenue.");
const euro = (usd: number) => `${usd.toFixed(4)} $`;

export default function Chat({ slot }: { slot?: HTMLElement | null }) {
  const [s, dispatch] = useReducer(reduce, initialState);
  const [key, setKey] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const settings = useRef<Settings | null>(null);
  const keyRef = useRef<string | null>(null);
  const queue = useRef<SessionEvent[]>([]);
  const frame = useRef(0);
  const token = useRef(0); // identifies the current session; stale channels are ignored
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

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
    queue.current.push(e);
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        queue.current.splice(0).forEach(dispatch);
      });
    }
  }, []);

  // Models become available once the bridge is ready.
  useEffect(() => {
    if (key && s.sessionState === "idle" && !models.length) sessionModels(key).then(setModels, () => {});
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
    dispatch({ kind: "reset" });
    try {
      if (resumeFrom) {
        const past = await sessionHistory(resumeFrom.key);
        // Pending permission requests of a past session are obsolete.
        past.filter((e) => e.kind === "sdk" || e.kind === "user").forEach(dispatch);
      }
      const k = await sessionStart(
        dir,
        resumeFrom?.model ?? settings.current?.defaultModel ?? null,
        settings.current?.defaultPermissionMode ?? "default",
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
    if (!key || !text) return;
    setDraft("");
    follow.current = true;
    sessionSend(key, text).catch((e) => setLocalError(errText(e)));
  };
  const interrupt = () => key && sessionInterrupt(key).catch((e) => setLocalError(errText(e)));
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
  const error = localError ?? s.error;

  const head = (
    <div className="session">
      <span className="session__state">{s.sessionState ? STATE_LABEL[s.sessionState] : "Aucune session"}</span>
      {key && (
        <select
          className="session__model"
          aria-label="Modèle"
          value={s.model ?? ""}
          disabled={!models.length}
          onChange={(e) => key && sessionSetModel(key, e.target.value).catch((x) => setLocalError(errText(x)))}
        >
          {s.model && !models.some((m) => m.value === s.model) && <option value={s.model}>{s.model}</option>}
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.displayName}</option>
          ))}
        </select>
      )}
      <span className="session__cost" aria-label="Coût de la session">
        {euro(s.costUsd)}
      </span>
    </div>
  );

  return (
    <section className="chat" aria-label="Chat">
      {slot ? createPortal(head, slot) : head}

      {!key ? (
        <div className="welcome">
          <div className="welcome__panel">
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
              <button type="button" className="composer__send" onClick={send} disabled={!draft.trim()} aria-label="Envoyer" title="Envoyer (Entrée)">
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
