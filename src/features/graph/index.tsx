import { useEffect, useState } from "react";
import { ShareNetwork } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { Markdown } from "@/components/ui/ai-thinking-and-tool-calls";
import { graphSummary, graphUpdate, type GraphSummary } from "../../ipc/project";
import { FolderPicker, useProjectDir } from "../projects/folder";
import { freshness } from "../projects/logic";
import "../projects/projects.css";

const FRESH = { fresh: "Graphe à jour", stale: "En retard sur le dernier commit", unknown: "Fraîcheur inconnue" };

export default function Graph() {
  const [dir, setDir] = useProjectDir();
  const [g, setG] = useState<GraphSummary | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dir) return;
    let live = true;
    setG(undefined);
    setError(null);
    graphSummary(dir).then((s) => live && setG(s), () => live && setError("Impossible de lire le graphe."));
    return () => {
      live = false;
    };
  }, [dir]);

  const update = () => {
    setBusy(true);
    setError(null);
    graphUpdate(dir).then(setG, () => setError("La mise à jour du graphe a échoué.")).finally(() => setBusy(false));
  };

  return (
    <section className="proj" aria-label="Graphe">
      <div className="proj__head">
        <h1>Graphe</h1>
        <FolderPicker dir={dir} setDir={setDir} />
        <button type="button" disabled={!dir || busy} onClick={update}>
          {busy ? "Mise à jour… (3 min au plus)" : "Mettre à jour"}
        </button>
      </div>
      {!dir && <EmptyState icon={ShareNetwork} title="Aucun dossier" text="Choisis un dossier de projet." />}
      {error && <p role="alert">{error}</p>}
      {dir && g === null && (
        <EmptyState icon={ShareNetwork} title="Pas de graphe" text="Ce dossier n'a pas de graphe. Lance « Mettre à jour » pour le créer." />
      )}
      {g && (
        <>
          <div className="proj__card proj__stats" aria-live="polite">
            <span>{g.nodes} nœuds</span>
            <span>{g.edges} liens</span>
            <span className="proj__badge">{FRESH[freshness(g)]}</span>
          </div>
          <div className="proj__card">
            <h2>Communautés</h2>
            <ul className="proj__list">
              {g.communities.map((c) => (
                <li key={c.id}>{c.name} <span className="proj__muted">· {c.size}</span></li>
              ))}
            </ul>
          </div>
          <div className="proj__card">
            <h2>Nœuds les plus connectés</h2>
            <ul className="proj__list">
              {g.topNodes.map((n, i) => (
                <li key={`${n.label}-${i}`}>
                  <strong>{n.label}</strong> <span className="proj__muted">· {n.degree} liens{n.file ? ` · ${n.file}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
          {g.reportMarkdown && (
            <div className="proj__card">
              <h2>Rapport</h2>
              <Markdown text={g.reportMarkdown} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
