import { useEffect, useState } from "react";
import { Robot } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { Tally } from "../../ui/Tally";
import { durationOf, FILTERS, listAgents, matches, type AgentStore, type Filter } from "./reduce";
import "./agents.css";

const fmtDuration = (ms: number | null) => (ms === null ? "—" : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);
const fmtTokens = (n: number | null) => (n === null ? "—" : n < 1000 ? `${n} tok` : `${(n / 1000).toFixed(1)}k tok`);

type Props = { store: AgentStore; onOpenSession: (key: string) => boolean }; // false = that session is not open

export default function Agents({ store, onOpenSession }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [closed, setClosed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const cards = listAgents(store);
  const running = cards.some((c) => durationOf(c, now) !== c.durationMs);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (cards.length === 0) return <EmptyState icon={Robot} title="Agents" text="Les sous-agents lancés par Claude apparaîtront ici." />;
  const shown = cards.filter((c) => matches(c, filter));

  return (
    <section className="agents" aria-label="Agents">
      <div className="agents__head">
        <h1>Agents</h1>
        <div className="agents__filters" role="group" aria-label="Filtrer les agents">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} {cards.filter((c) => matches(c, f.id)).length}
            </button>
          ))}
        </div>
      </div>
      {closed && <p className="muted" role="status">Session fermée : rouvre-la depuis les sessions récentes du Chat.</p>}
      {shown.length === 0 ? (
        <p className="muted">Aucun agent dans ce filtre.</p>
      ) : (
        <ul className="agents__grid">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className="agent" onClick={() => setClosed(!onOpenSession(c.sessionKey))} aria-label={`${c.type} : ${c.task}. Ouvrir la session`}>
                <Tally state={c.state} />
                <span className="agent__meta">{c.type} · {c.sessionKey}</span>
                <span className="agent__task">{c.task}</span>
                {c.lastMessage && <span className="agent__last">« {c.lastMessage} »</span>}
                <span className="agent__meta">{fmtTokens(c.tokens)} · {fmtDuration(durationOf(c, now))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Chronologie</h2>
      <ol className="agents__timeline" aria-label="Chronologie des agents">
        {cards.map((c) => (
          <li key={c.id}>
            <Tally state={c.state} />
            <span>{c.type} · {c.task}</span>
            <span className="agent__meta">{fmtDuration(durationOf(c, now))}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
