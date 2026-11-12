import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CaretRight, ShareNetwork, X } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { graphData, graphSummary, graphUpdate, type GraphData, type GraphSummary } from "../../ipc/project";
import { FolderPicker, useProjectDir } from "../projects/folder";
import { freshness } from "../projects/logic";
import { GraphCanvas } from "./GraphCanvas";
import { prepare, statusLine, type Community } from "./prepare";
import "../projects/projects.css";
import "./graph.css";

const swatch = (c: Community) => (c.color < 0 ? "var(--color-text-muted)" : `var(--color-graph-${c.color + 1})`);
const TOP_PER_COMMUNITY = 15;

export default function Graph() {
  const [dir, setDir] = useProjectDir();
  const [data, setData] = useState<GraphData | null | undefined>(undefined); // undefined = loading
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [centerOn, setCenterOn] = useState<{ id: string } | null>(null);

  const load = (d: string, live = () => true) =>
    Promise.all([graphData(d), graphSummary(d)]).then(
      ([g, s]) => {
        if (!live()) return;
        setData(g);
        setSummary(s);
      },
      () => live() && setError("Impossible de lire le graphe."),
    );

  useEffect(() => {
    if (!dir) return;
    let live = true;
    setData(undefined);
    setSelected(null);
    setError(null);
    void load(dir, () => live);
    return () => {
      live = false;
    };
  }, [dir]);

  const update = () => {
    setBusy(true);
    setError(null);
    graphUpdate(dir)
      .then(() => load(dir), () => setError("La mise à jour du graphe a échoué."))
      .finally(() => setBusy(false));
  };

  const p = useMemo(() => (data ? prepare(data) : null), [data]);
  const byId = useMemo(() => new Map(p?.nodes.map((n) => [n.id, n])), [p]);
  const sel = selected ? byId.get(selected) : undefined;
  const status = p && statusLine(summary?.nodes ?? p.nodes.length, summary?.edges ?? p.links.length, summary ? freshness(summary) : "unknown", data!.truncated);
  const pick = (id: string) => {
    setSelected(id);
    setCenterOn({ id });
  };
  const description = p
    ? `Graphe de ${p.nodes.length} éléments en ${p.communities.length} communautés. Les plus grandes : ${p.communities.slice(0, 3).map((c) => c.name).join(", ")}. Flèches pour déplacer, plus et moins pour zoomer, zéro pour recadrer.`
    : "";

  return (
    <section className="graph" aria-label="Graphe">
      <header className="graph__head">
        <h1>Graphe</h1>
        <FolderPicker dir={dir} setDir={setDir} />
        {status && <p className="graph__status" aria-live="polite">{status}</p>}
        <button type="button" className="graph__icon" disabled={!dir || busy} onClick={update} aria-label={busy ? "Mise à jour en cours, 3 minutes au plus" : "Mettre à jour le graphe"} title="Mettre à jour">
          <ArrowClockwise size="var(--icon-sm)" aria-hidden="true" className={busy ? "graph__spin" : undefined} />
        </button>
      </header>
      {error && <p role="alert" className="graph__error">{error}</p>}
      {!dir && <EmptyState icon={ShareNetwork} title="Aucun dossier" text="Choisis un dossier de projet." />}
      {dir && data === undefined && !error && <p className="graph__status" role="status">Chargement du graphe…</p>}
      {dir && data === null && (
        <EmptyState icon={ShareNetwork} title="Pas encore de graphe" text="Ce dossier n'a pas de graphe. Mets-le à jour pour le créer." />
      )}
      {p && p.nodes.length === 0 && <EmptyState icon={ShareNetwork} title="Graphe vide" text="Le graphe de ce dossier ne contient aucun élément." />}
      {p && p.nodes.length > 0 && (
        <div className="graph__body">
          <GraphCanvas p={p} selected={selected} onSelect={setSelected} label={description} centerOn={centerOn} />
          <p className="sr-only">{description}</p>

          <aside className="graph__legend" aria-label="Communautés">
            <h2>Communautés</h2>
            <ul>
              {p.communities.map((c) => {
                const top = p.nodes.filter((n) => n.community === c.id).sort((a, b) => b.degree - a.degree).slice(0, TOP_PER_COMMUNITY);
                return (
                  <li key={c.id}>
                    <details>
                      <summary>
                        <CaretRight className="graph__caret" size="var(--icon-sm)" aria-hidden="true" />
                        <span className="graph__swatch" style={{ background: swatch(c) }} aria-hidden="true" />
                        <span className="graph__name">{c.name}</span>
                        <span className="graph__count">{c.size}</span>
                      </summary>
                      <ul className="graph__nodes">
                        {top.map((n) => (
                          <li key={n.id}>
                            <button type="button" aria-current={n.id === selected} onClick={() => pick(n.id)}>{n.label}</button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </aside>

          {sel && (
            <section className="graph__card" aria-label={`Fiche de ${sel.label}`}>
              <div className="graph__card-head">
                <h2>{sel.label}</h2>
                <button type="button" className="graph__icon" aria-label="Fermer la fiche" onClick={() => setSelected(null)}>
                  <X size="var(--icon-sm)" aria-hidden="true" />
                </button>
              </div>
              {sel.file && <p className="graph__file">{sel.file}</p>}
              {(() => {
                const c = p.communities.find((x) => x.id === sel.community)!;
                return (
                  <p className="graph__meta">
                    <span className="graph__swatch" style={{ background: swatch(c) }} aria-hidden="true" />
                    {c.name}
                  </p>
                );
              })()}
              <NeighborList ids={p.neighbors.get(sel.id) ?? []} label={(id) => byId.get(id)?.label ?? id} onPick={pick} />
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function NeighborList({ ids, label, onPick }: { ids: string[]; label: (id: string) => string; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [ids]);
  if (ids.length === 0) return <p className="graph__meta">Aucun voisin.</p>;
  const shown = all ? ids : ids.slice(0, 12);
  return (
    <>
      <h3>{ids.length === 1 ? "1 voisin" : `${ids.length} voisins`}</h3>
      <ul className="graph__neighbors">
        {shown.map((id) => (
          <li key={id}>
            <button type="button" onClick={() => onPick(id)}>{label(id)}</button>
          </li>
        ))}
      </ul>
      {!all && ids.length > shown.length && (
        <button type="button" className="graph__more" onClick={() => setAll(true)}>Voir les {ids.length} voisins</button>
      )}
    </>
  );
}
