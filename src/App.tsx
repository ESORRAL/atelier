import { lazy, Suspense, useState } from "react";

const Chat = lazy(() => import("./features/chat/Chat"));
const Demo = lazy(() => import("./features/demo/Demo"));

export default function App() {
  const [demo, setDemo] = useState(false);
  // The Chat portals its session status (state, model, cost) into this slot of the top bar.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">
          <span className="topbar__lamp" aria-hidden="true" />
          Atelier
        </span>
        <div className="topbar__slot" ref={setSlot} />
        <button type="button" className="btn btn--ghost" onClick={() => setDemo(!demo)}>
          {demo ? "Retour au chat" : "Démo des composants"}
        </button>
      </header>
      <main className="app__main">
        <Suspense fallback={null}>{demo ? <Demo /> : <Chat slot={slot} />}</Suspense>
      </main>
    </div>
  );
}
