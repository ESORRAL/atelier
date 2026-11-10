import { CheckCircle, CircleDashed, CircleNotch, Eye, HandPalm, XCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import "./Tally.css";

export type TallyState = "queued" | "running" | "waiting-permission" | "review" | "done" | "failed";

const STATES: Record<TallyState, { label: string; Icon: Icon; color: string }> = {
  queued: { label: "En attente", Icon: CircleDashed, color: "var(--color-state-queued)" },
  running: { label: "En cours", Icon: CircleNotch, color: "var(--color-state-running)" },
  "waiting-permission": { label: "Autorisation requise", Icon: HandPalm, color: "var(--color-state-waiting)" },
  review: { label: "À relire", Icon: Eye, color: "var(--color-state-review)" },
  done: { label: "Terminé", Icon: CheckCircle, color: "var(--color-state-done)" },
  failed: { label: "Échec", Icon: XCircle, color: "var(--color-state-failed)" },
};

export function Tally({ state }: { state: TallyState }) {
  const { label, Icon: StateIcon, color } = STATES[state];
  return (
    <span className="tally" data-state={state} style={{ color }}>
      <span className="tally__lamp" aria-hidden="true" />
      <StateIcon className="tally__icon" size="var(--icon-sm)" aria-hidden="true" />
      <span className="tally__label">{label}</span>
    </span>
  );
}
