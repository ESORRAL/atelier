import { useEffect, useState } from "react";
import { FolderSimple, GitBranch } from "@phosphor-icons/react";
import { EmptyState } from "../../shell/EmptyState";
import { projectInfo, type ProjectInfo, type TaskInfo } from "../../ipc/project";
import { FolderPicker, useProjectDir } from "./folder";
import { folderState, groupTasks, STATUSES } from "./logic";
import "./projects.css";

type Status = (typeof STATUSES)[number];
const STATUS: Record<Status, { label: string; color: string }> = {
  todo: { label: "À faire", color: "var(--color-state-queued)" },
  doing: { label: "En cours", color: "var(--color-state-running)" },
  review: { label: "À relire", color: "var(--color-state-review)" },
  done: { label: "Terminées", color: "var(--color-state-done)" },
  blocked: { label: "Bloquées", color: "var(--color-state-failed)" },
};
const ACTIVE: Status[] = ["todo", "doing", "review", "blocked"];

function Tasks({ tasks }: { tasks: TaskInfo[] }) {
  return (
    <ul className="proj__tasks">
      {tasks.map((t) => (
        <li key={t.id} className="proj__task" title={t.file}>
          <span className="proj__task-id">{t.id}</span>
          <span className="proj__task-title">{t.title}</span>
        </li>
      ))}
    </ul>
  );
}

function Heading({ s, n }: { s: Status; n: number }) {
  return (
    <>
      <span className="proj__lamp" style={{ background: STATUS[s].color }} aria-hidden="true" />
      {STATUS[s].label}
      <span className="proj__count">{n}</span>
    </>
  );
}

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
  const columns = groups ? ACTIVE.filter((s) => s !== "blocked" || groups.blocked.length > 0) : [];
  const name = dir.split("/").filter(Boolean).pop() ?? "Projets";

  return (
    <section className="proj" aria-label="Projets">
      <header className="proj__head">
        <div className="proj__title">
          <h1>{dir ? name : "Projets"}</h1>
          {info?.isGit && (
            <p className="proj__facts">
              <span className="proj__fact"><GitBranch size="var(--icon-sm)" aria-hidden="true" />{info.branch ?? "détachée"}</span>
              <span className="proj__fact">{info.dirtyFiles === 0 ? "Rien à committer" : info.dirtyFiles === 1 ? "1 fichier modifié" : `${info.dirtyFiles} fichiers modifiés`}</span>
            </p>
          )}
        </div>
        <FolderPicker dir={dir} setDir={setDir} />
      </header>
      {state === "none" && <EmptyState icon={FolderSimple} title="Aucun dossier" text="Choisis un dossier de projet." />}
      {error && <p role="alert">Impossible de lire ce dossier.</p>}
      {state === "not-git" && <EmptyState icon={FolderSimple} title="Pas un dépôt git" text="Ce dossier n'est pas un dépôt git." />}
      {info && groups && (
        <>
          <section aria-label="Tâches">
            {info.tasks.length === 0 ? (
              <p className="proj__muted">Aucune fiche dans tasks/.</p>
            ) : (
              <div className="proj__board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                {columns.map((s) => (
                  <section key={s} className="proj__col" aria-label={`${STATUS[s].label}, ${groups[s].length}`}>
                    <h2><Heading s={s} n={groups[s].length} /></h2>
                    {groups[s].length === 0 ? <p className="proj__muted proj__none">Rien ici.</p> : <Tasks tasks={groups[s]} />}
                  </section>
                ))}
              </div>
            )}
          </section>

          {groups.done.length > 0 && (
            <details className="proj__fold">
              <summary><Heading s="done" n={groups.done.length} /></summary>
              <Tasks tasks={groups.done} />
            </details>
          )}
          <details className="proj__fold">
            <summary>Worktrees<span className="proj__count">{info.worktrees.length}</span></summary>
            <ul className="proj__list">
              {info.worktrees.map((w) => (
                <li key={w.path}>
                  <span className="proj__mono">{w.path}</span>
                  <span className="proj__muted">{w.branch ?? "détachée"}{w.locked ? ", verrouillé" : ""}</span>
                </li>
              ))}
            </ul>
          </details>
          <details className="proj__fold">
            <summary>Derniers commits<span className="proj__count">{info.recentCommits.length}</span></summary>
            {info.recentCommits.length === 0 ? (
              <p className="proj__muted">Aucun commit.</p>
            ) : (
              <ul className="proj__list">
                {info.recentCommits.map((c) => (
                  <li key={c.hash}>
                    <span>{c.subject}</span>
                    <span className="proj__muted">
                      <span className="proj__mono">{c.hash.slice(0, 7)}</span> le {new Date(c.date).toLocaleDateString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      )}
    </section>
  );
}
