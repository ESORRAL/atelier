import { lazy, Suspense, useState } from "react";

const Chat = lazy(() => import("./features/chat/Chat"));
const Demo = lazy(() => import("./features/demo/Demo"));

export default function App() {
  const [demo, setDemo] = useState(false);
  return (
    <main>
      <Suspense fallback={null}>{demo ? <Demo /> : <Chat />}</Suspense>
      <p>
        <button type="button" onClick={() => setDemo(!demo)}>
          {demo ? "Retour au chat" : "Démo des composants"}
        </button>
      </p>
    </main>
  );
}
