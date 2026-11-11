import { useEffect, useState } from "react";
import { advance, load, save, start, stop, type FocusState } from "./timer";

/** Focus state + timer; `notice` is set when a phase ends (cleared by `dismiss`). */
export function useFocus() {
  const [state, setState] = useState<FocusState>(() => load(localStorage));
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => save(localStorage, state), [state]);

  useEffect(() => {
    if (!state.active) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const { state: next, ended } = advance(state, t);
      if (ended) {
        setState(next);
        setNotice(next.phase === "break" ? "Pause : place à la détente." : "Retour au travail.");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state]);

  return {
    state,
    now,
    notice,
    dismiss: () => setNotice(null),
    enter: () => setState((s) => start(s, Date.now())),
    leave: () => {
      setState(stop);
      setNotice(null);
    },
    setDurations: (workMin: number, breakMin: number) => setState((s) => ({ ...s, workMin, breakMin })),
  };
}
