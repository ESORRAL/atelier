import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { musicOpen, type MusicTarget } from "../../ipc/music";
import Music from "./index";
import { searchTerm, trapIndex } from "./panel";

const FOCUSABLE = "button:not(:disabled), input, select, [href], [tabindex]:not([tabindex='-1'])";

// Matches --dur-base: the content stays mounted until the slide-out ends, then unmounts (stops polling).
const SLIDE_MS = 240;

/** Left slide-in panel (from behind the rail): the remote plus Apple Music shortcuts. Esc closes; Tab stays inside. */
export function MusicPanel({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      root.current?.querySelector<HTMLElement>("input")?.focus();
      return;
    }
    const t = setTimeout(() => setMounted(false), SLIDE_MS);
    return () => clearTimeout(t);
  }, [isOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      const items = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const next = trapIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
      if (next != null) {
        e.preventDefault();
        items[next].focus();
      }
    }
  };

  const open = (target: MusicTarget, query: string | null) =>
    musicOpen(target, query).then(() => setError(false), () => setError(true));
  const term = searchTerm(q);

  return (
    <aside ref={root} className={`music-panel${isOpen ? " music-panel--open" : ""}`} aria-label="Musique" aria-hidden={!isOpen} onKeyDown={onKeyDown}>
      <header className="music-panel__head">
        <h2 className="music-panel__title">Musique</h2>
        <button type="button" className="btn btn--ghost" aria-label="Fermer la musique" onClick={onClose}>
          <X size="var(--icon-sm)" aria-hidden="true" />
        </button>
      </header>
      <form
        className="music-panel__search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (term) open("search", term);
        }}
      >
        <label htmlFor="music-search" className="sr-only">Rechercher sur Apple Music</label>
        <input id="music-search" value={q} maxLength={200} placeholder="Rechercher sur Apple Music" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={!term}>Rechercher</button>
      </form>
      <div className="music-panel__links">
        <button type="button" className="btn btn--ghost" onClick={() => open("playlists", null)}>Playlists</button>
        <button type="button" className="btn btn--ghost" onClick={() => open("library", null)}>Bibliothèque</button>
        <button type="button" className="btn btn--ghost" onClick={() => open("home", null)}>Ouvrir Apple Music</button>
      </div>
      {error && <p className="chat__error" role="alert">Impossible d'ouvrir Apple Music.</p>}
      {mounted && <Music />}
    </aside>
  );
}
