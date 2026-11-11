import { useEffect, useState } from "react";
import { pickFolder } from "../../ipc/desktop";
import { settingsGet } from "../../ipc/claude";
import "./projects.css";

const KEY = "atelier.projectDir";
const listeners = new Set<(d: string) => void>();

/** Current project folder shared by the Projets and Graphe tabs, kept in localStorage. */
export function useProjectDir(): [string, (d: string) => void] {
  const [dir, setDirState] = useState(() => localStorage.getItem(KEY) ?? "");
  useEffect(() => {
    listeners.add(setDirState);
    return () => void listeners.delete(setDirState);
  }, []);
  const setDir = (d: string) => {
    localStorage.setItem(KEY, d);
    listeners.forEach((l) => l(d));
  };
  return [dir, setDir];
}

export function FolderPicker({ dir, setDir }: { dir: string; setDir: (d: string) => void }) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    settingsGet().then(
      (s) => {
        setRecent(s.recentCwds);
        // shortcut: default is the most recent folder, not the displayed Chat session's (Chat is outside this card's paths)
        if (!localStorage.getItem(KEY) && s.recentCwds[0]) setDir(s.recentCwds[0]);
      },
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const options = dir && !recent.includes(dir) ? [dir, ...recent] : recent;
  return (
    <div className="proj__pick">
      <select aria-label="Dossier du projet" value={dir} onChange={(e) => setDir(e.target.value)}>
        {!dir && <option value="">Choisir un dossier…</option>}
        {options.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <button type="button" onClick={() => pickFolder().then((d) => d && setDir(d), () => {})}>Parcourir…</button>
    </div>
  );
}
