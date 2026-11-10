import { lazy, Suspense, useEffect, useState } from "react";
import { appVersion } from "./ipc/app";

const Demo = lazy(() => import("./features/demo/Demo"));

export default function App() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    appVersion().then(setVersion, () => setVersion(""));
  }, []);
  return (
    <main>
      <h1>Atelier</h1>
      <p>{version && `v${version}`}</p>
      <Suspense fallback={null}>
        <Demo />
      </Suspense>
    </main>
  );
}
