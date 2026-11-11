import { useEffect, useState } from "react";
import { FolderSimple } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { projectInfo, type ProjectInfo } from "../../ipc/project";
import { FolderPicker, useProjectDir } from "./folder";
import { folderState, groupTasks, STATUSES } from "./logic";

export default function Projects() {
  const [dir, setDir] = useProjectDir();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!dir) return;
    let live = true;
    setInfo(null);
    setError(false);
    projectInfo(dir).then((i) => live && setInfo(i), () => live && setError(true));
    return () => {
      live = false;
    };
  }, [dir]);

  const state = folderState(dir, info);
  const groups = info?.isGit ? groupTasks(info.tasks) : null;

  return (
    <section className="proj" aria-label="Projets">
      <div className="proj__head">
        <h1>Projets</h1>
        <FolderPicker dir={dir} setDir={setDir} />
      </div>
      {state === "none" && <EmptyState icon={FolderSimple} title="Aucun dossier" text="Choisis un dossier de projet." />}
      {error && <p role="alert">Impossible de lire ce dossier.</p>}
      {state === "not-git" && <EmptyState icon={FolderSimple} title="Pas un dépôt git" text="Ce dossier n'est pas un dépôt git." />}
      {info && groups && (
        <>
          <div className="proj__card proj__stats">
            <span>Branche <strong className="proj__mono">{info.branch ?? "(détachée)"}</strong></span>
            <span>{info.dirtyFiles === 0 ? "Aucune modification" : `${info.dirtyFiles} fichier(s) modifié(s)`}</span>
          </div>
          <div className="proj__card">
            <h2>Worktrees</h2>
            <ul className="proj__list">
              {info.worktrees.map((w) => (
                <li key={w.path}>
                  <span className="proj__mono">{w.path}</span> · {w.branch ?? "détaché"} · {w.head.slice(0, 7)}
                  {w.locked && " · verrouillé"}
                </li>
              ))}
            </ul>
          </div>
          <div className="proj__card">
            <h2>Derniers commits</h2>
            {info.recentCommits.length === 0 ? (
              <p className="proj__muted">Aucun commit.</p>
            ) : (
              <ul className="proj__list">
                {info.recentCommits.map((c) => (
                  <li key={c.hash}>
                    <span className="proj__mono">{c.hash.slice(0, 7)}</span> {c.subject} ·{" "}
                    <span className="proj__muted">{new Date(c.date).toLocaleDateString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2>Tâches</h2>
            {info.tasks.length === 0 ? (
              <p className="proj__muted">Aucune fiche dans tasks/.</p>
            ) : (
              <div className="proj__board">
                {STATUSES.map((s) => (
                  <section key={s} className="proj__col" aria-label={`Tâches ${s}`}>
                    <h3>{s} ({groups[s].length})</h3>
                    {groups[s].map((t) => (
                      <article key={t.id} className="proj__task" title={t.file}>
                        <strong>{t.id}</strong> {t.title}
                        <div className="proj__muted">{[t.agent, t.model].filter(Boolean).join(" · ")}</div>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
