import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Folder, Plus, X } from "@phosphor-icons/react";
import { sessionsList, settingsGet, type SessionEntry, type SessionEvent } from "../../ipc/claude";
import { pickFolder } from "../../ipc/desktop";
import { Tally } from "../../ui/Tally";
import { ChatSession, euro } from "./ChatSession";
import {
  closeTab,
  cycleStep,
  cycleTab,
  noTabs,
  openTab,
  patchTab,
  selectTab,
  tallyOf,
  TOO_MANY_TABS,
} from "./sessions";
import "./chat.css";

export type { SessionEventLog } from "./sessions";

/** What the app shell shows about the displayed session (right panel). */
export type ChatInfo = { key: string | null; cwd: string; model: string | null; costUsd: number; state: string | null; working: boolean };
/** Imperative actions the shell's command palette can trigger. */
export type ChatControls = { newSession: () => void; interrupt: () => void; openSession: (key: string) => boolean };

const NO_INFO: ChatInfo = { key: null, cwd: "", model: null, costUsd: 0, state: null, working: false };

type ChatProps = {
  slot?: HTMLElement | null;
  onInfo?: (info: ChatInfo) => void; // the displayed session only
  onEvent?: (key: string, e: SessionEvent) => void; // every raw event of every open session
  controlsRef?: RefObject<ChatControls | null>;
};

export default function Chat({ slot, onInfo, onEvent, controlsRef }: ChatProps) {
  const [tabs, setTabs] = useState(noTabs);
  const [cwd, setCwd] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const interruptRef = useRef<(() => void) | null>(null);
  const cwdInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    settingsGet().then((st) => {
      setRecent(st.recentCwds);
      if (st.recentCwds[0]) setCwd((c) => c || st.recentCwds[0]);
    }, () => {});
  }, []);

  // The welcome screen lists past sessions: refresh it each time it is shown.
  const welcome = tabs.active === null;
  useEffect(() => {
    if (welcome) sessionsList().then(setSessions, () => {});
  }, [welcome]);
  useEffect(() => {
    if (welcome) onInfo?.(NO_INFO);
  }, [welcome, onInfo]);
  // Closing the last tab drops the focus: give it to the folder field.
  useEffect(() => {
    if (welcome && document.activeElement === document.body) cwdInput.current?.focus();
  }, [welcome]);

  const open = (dir: string, resume: SessionEntry | null = null) => {
    const next = openTab(tabs, dir, resume);
    if (!next) return setError(TOO_MANY_TABS);
    setError(null);
    setTabs(next);
  };
  const close = (id: number) => setTabs((t) => closeTab(t, id));
  const onStatus = useCallback((id: number, patch: Parameters<typeof patchTab>[2]) => setTabs((t) => patchTab(t, id, patch)), []);
  const onStartError = useCallback((id: number, message: string) => {
    // Back to the welcome screen (the folder stays in the field) only if the failing tab is on screen.
    setTabs((t) => (t.active === id ? selectTab(closeTab(t, id), null) : closeTab(t, id)));
    setError(message);
  }, []);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  if (controlsRef)
    controlsRef.current = {
      newSession: () => setTabs((t) => selectTab(t, null)),
      interrupt: () => !welcome && interruptRef.current?.(),
      openSession: (key) => {
        const tab = tabsRef.current.list.find((x) => x.key === key);
        if (tab) setTabs((t) => selectTab(t, tab.id));
        return !!tab;
      },
    };

  // Ctrl+Tab / Ctrl+Maj+Tab switch sessions while the Chat is on screen.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const step = cycleStep(e);
      if (!step || !root.current || root.current.closest("[hidden]")) return;
      e.preventDefault();
      setTabs((t) => cycleTab(t, step));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <section ref={root} className="chat" aria-label="Chat">
      {tabs.list.length > 0 && (
        <nav className="chat-tabs" aria-label="Sessions ouvertes (Ctrl+Tab pour passer à la suivante)">
          <ul className="chat-tabs__list">
            {tabs.list.map((t) => (
              <li key={t.id} className="chat-tabs__item" data-active={t.id === tabs.active || undefined}>
                <button
                  type="button"
                  className="chat-tabs__select"
                  aria-current={t.id === tabs.active ? "page" : undefined}
                  title={t.cwd}
                  onClick={() => setTabs((x) => selectTab(x, t.id))}
                >
                  <Tally state={tallyOf(t)} />
                  <span className="chat-tabs__title">{t.title}</span>
                </button>
                <button type="button" className="chat-tabs__close" aria-label={`Fermer la session ${t.title}`} title="Fermer la session" onClick={() => close(t.id)}>
                  <X size="var(--icon-sm)" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="chat-tabs__new"
            aria-label="Ouvrir une autre session"
            aria-current={welcome ? "page" : undefined}
            title="Ouvrir une autre session"
            onClick={() => setTabs((t) => selectTab(t, null))}
          >
            <Plus size="var(--icon-sm)" aria-hidden="true" />
          </button>
        </nav>
      )}

      <div className="welcome" hidden={!welcome}>
        <div className="welcome__panel">
          <h1 className="welcome__title">Sur quel projet <span className="welcome__nowrap">travailles-tu&nbsp;?</span></h1>
          <p className="welcome__lede">Choisis un dossier, Claude ouvrira une session dedans.</p>
          <form
            className="welcome__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (cwd.trim()) open(cwd.trim());
            }}
          >
            <label htmlFor="chat-cwd" className="sr-only">Dossier du projet</label>
            <input ref={cwdInput} id="chat-cwd" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/chemin/vers/le/projet" list="chat-recent" />
            <button type="button" className="btn btn--ghost" onClick={() => pickFolder().then((d) => d && setCwd(d), () => {})}>
              Parcourir…
            </button>
            <datalist id="chat-recent">{recent.map((r) => <option key={r} value={r} />)}</datalist>
            <button type="submit" className="btn btn--primary" disabled={!cwd.trim()}>
              Démarrer une session
            </button>
          </form>
          {error && <p className="chat__error" role="alert">{error}</p>}
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
                  <button type="button" className="session-row" onClick={() => open(e.cwd, e)}>
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

      {tabs.list.map((t) => (
        <ChatSession
          key={t.id}
          id={t.id}
          cwd={t.cwd}
          resume={t.resume}
          active={t.id === tabs.active}
          slot={slot}
          onStatus={onStatus}
          onStartError={onStartError}
          onInfo={onInfo}
          onEvent={onEvent}
          interruptRef={interruptRef}
        />
      ))}
    </section>
  );
}
