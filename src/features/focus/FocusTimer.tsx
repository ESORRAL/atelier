import "./focus.css";
import { clampMinutes, formatRemaining, remaining, type FocusState } from "./timer";

type Props = {
  state: FocusState;
  now: number;
  notice: string | null;
  onDismiss: () => void;
  onDurations: (work: number, brk: number) => void;
};

/** Top-bar chip: phase, remaining time, durations, and a silent in-app end-of-phase notice. */
export function FocusTimer({ state, now, notice, onDismiss, onDurations }: Props) {
  const num = (label: string, value: number, set: (n: number) => void) => (
    <label className="focus__dur">
      {label}
      <input type="number" min={1} max={180} value={value} onChange={(e) => set(clampMinutes(Number(e.target.value), value))} />
    </label>
  );
  return (
    <div className="focus">
      <span className="focus__time" role="timer">
        {state.phase === "work" ? "Focus" : "Pause"} {formatRemaining(remaining(state, now))}
      </span>
      {num("Travail (min)", state.workMin, (n) => onDurations(n, state.breakMin))}
      {num("Pause (min)", state.breakMin, (n) => onDurations(state.workMin, n))}
      {notice && (
        <span className="focus__notice" role="status">
          {notice}{" "}
          <button type="button" className="btn btn--ghost" onClick={onDismiss}>OK</button>
        </span>
      )}
    </div>
  );
}
