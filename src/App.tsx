import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, SidebarSimple, Terminal } from "@phosphor-icons/react";
import type { SessionEvent } from "./ipc/claude";
import type { ChatControls, ChatInfo } from "./features/chat/Chat";
import { getTheme, setTheme } from "./ui/theme";
import { Logo } from "./ui/Logo";
import { Palette } from "./shell/Palette";
import { Rail } from "./shell/Rail";
import { isTabId, TABS, type TabId } from "./shell/tabs";
import { shortcutAction } from "./shell/shortcuts";
import type { Command } from "./shell/palette";
import "./shell/shell.css";

const Chat = lazy(() => import("./features/chat/Chat"));
const Demo = lazy(() => import("./features/demo/Demo"));

const LOG_MAX = 200;
const LOG_LINE_MAX = 4000;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function usePersisted<T extends string>(key: string, initial: T, valid: (v: unknown) => v is T) {
  const [v, set] = useState<T>(() => {
    const s = stored(key);
    return valid(s) ? s : initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [key, v]);
  return [v, set] as const;
}
const isOpenClosed = (v: unknown): v is "open" | "closed" => v === "open" || v === "closed";

const EMPTY_INFO: ChatInfo = { key: null, cwd: "", model: null, costUsd: 0, state: null, working: false };

export default function App() {
  const [demo, setDemo] = useState(false);
  // The Chat portals its session status (state, model, cost) into this slot of the top bar.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = usePersisted<TabId>("atelier.tab", "chat", isTabId);
  const [panel, setPanel] = usePersisted("atelier.panel", window.innerWidth >= 1280 ? "open" : "closed", isOpenClosed);
  const [drawer, setDrawer] = usePersisted("atelier.drawer", "closed", isOpenClosed);
  const [palette, setPalette] = useState(false);
  const [info, setInfo] = useState<ChatInfo>(EMPTY_INFO);
  const controls = useRef<ChatControls | null>(null);

  // Raw event log: kept in a ref (tokens arrive fast), rendered at most once per frame while open.
  const events = useRef<string[]>([]);
  const [, bump] = useState(0);
  const drawerOpen = useRef(false);
  drawerOpen.current = drawer === "open";
  const frame = useRef(0);
  const schedule = () => {
    if (!drawerOpen.current || frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      bump((n) => n + 1);
    });
  };
  const onEvent = useCallback((e: SessionEvent) => {
    let line = JSON.stringify(e);
    if (line.length > LOG_LINE_MAX) line = `${line.slice(0, LOG_LINE_MAX)}…`;
    events.current.push(line);
    if (events.current.length > LOG_MAX) events.current.shift();
    schedule();
  }, []);
  const onSessionReset = useCallback(() => {
    events.current = [];
    schedule();
  }, []);

  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (drawer === "open") logEnd.current?.scrollIntoView?.({ block: "end" });
  });

  const toggleTheme = () => {
    const light = getTheme() === "system" ? window.matchMedia("(prefers-color-scheme: light)").matches : getTheme() === "light";
    setTheme(light ? "dark" : "light");
  };
  const flip = (v: "open" | "closed") => (v === "open" ? "closed" : "open");
  const togglePanel = () => setPanel(flip);
  const toggleDrawer = () => setDrawer(flip);
  const goTo = (id: TabId) => {
    setDemo(false);
    setTab(id);
  };

  const commands: Command[] = [
    ...TABS.map((t, i) => ({ id: `tab-${t.id}`, label: t.label, group: "Onglets", shortcut: `Ctrl+${i + 1}`, run: () => goTo(t.id) })),
    { id: "new", label: "Nouvelle session", group: "Actions", run: () => { goTo("chat"); controls.current?.newSession(); } },
    { id: "interrupt", label: "Interrompre", group: "Actions", run: () => controls.current?.interrupt() },
    { id: "theme", label: "Basculer le thème", group: "Actions", run: toggleTheme },
    { id: "panel", label: "Replier ou ouvrir le panneau droit", group: "Actions", run: togglePanel },
    { id: "drawer", label: "Replier ou ouvrir le journal", group: "Actions", shortcut: "Ctrl+²", run: toggleDrawer },
  ];

  // Always-fresh handler for the single window listener.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    const a = shortcutAction(e);
    if (!a) return;
    e.preventDefault();
    if (a.kind === "palette") setPalette((p) => !p);
    else if (a.kind === "drawer") toggleDrawer();
    else if (TABS[a.index]) goTo(TABS[a.index].id);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const showPanel = tab === "chat" && !demo && panel === "open";
  const View = TABS.find((t) => t.id === tab)?.view;

  return (
    <div className={`shell${showPanel ? " shell--panel" : ""}`}>
      <header className="topbar shell__topbar">
        <span className="topbar__brand">
          <Logo size="var(--icon-lg)" working={info.working} />
          Atelier
        </span>
        <div className="topbar__slot" ref={setSlot} />
        {import.meta.env.DEV && (
          <button type="button" className="btn btn--ghost" onClick={() => setDemo(!demo)}>
            {demo ? "Retour au chat" : "Démo des composants"}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setPalette(true)} title="Palette de commandes (Ctrl+K)">
          <MagnifyingGlass size="var(--icon-sm)" aria-hidden="true" /> Ctrl+K
        </button>
        {tab === "chat" && !demo && (
          <button type="button" className="btn btn--ghost" aria-pressed={panel === "open"} onClick={togglePanel} title="Panneau droit">
            <SidebarSimple size="var(--icon-sm)" aria-hidden="true" /> Panneau
          </button>
        )}
        <button type="button" className="btn btn--ghost" aria-pressed={drawer === "open"} onClick={toggleDrawer} title="Journal (Ctrl+², F12)">
          <Terminal size="var(--icon-sm)" aria-hidden="true" /> Journal
        </button>
      </header>
      <Rail active={demo ? null : tab} onSelect={goTo} />
      <div className="shell__center">
        <main className="app__main shell__views">
          {/* Chat stays mounted behind other tabs so the session keeps running. */}
          <div className="shell__view" hidden={demo || tab !== "chat"}>
            <Suspense fallback={null}>
              <Chat slot={slot} onInfo={setInfo} onEvent={onEvent} onSessionReset={onSessionReset} controlsRef={controls} />
            </Suspense>
          </div>
          {demo ? (
            <Suspense fallback={null}><Demo /></Suspense>
          ) : (
            View && <Suspense fallback={null}><View /></Suspense>
          )}
        </main>
        {drawer === "open" && (
          <section className="drawer" aria-label="Journal des événements">
            <h2 className="drawer__title">Journal des événements</h2>
            <div className="drawer__log" role="log" aria-live="off" tabIndex={0}>
              {events.current.length === 0 ? (
                <p className="drawer__empty">Aucun événement pour cette session.</p>
              ) : (
                events.current.map((l, i) => <div key={i} className="drawer__line">{l}</div>)
              )}
              <div ref={logEnd} />
            </div>
          </section>
        )}
      </div>
      {showPanel && (
        <aside className="shell__panel" aria-label="Session">
          <h2 className="shell__panel-title">Session</h2>
          {info.key ? (
            <dl className="shell__facts">
              <dt>Dossier</dt><dd>{info.cwd}</dd>
              <dt>Clé</dt><dd>{info.key}</dd>
              <dt>Modèle</dt><dd>{info.model ?? "—"}</dd>
              <dt>Coût</dt><dd>{info.costUsd.toFixed(4)} $</dd>
              <dt>État</dt><dd>{info.state ?? "—"}</dd>
            </dl>
          ) : (
            <p className="muted">Aucune session en cours.</p>
          )}
        </aside>
      )}
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
    </div>
  );
}
