import { Fragment } from "react";
import { InstagramLogo, MusicNotes, YoutubeLogo } from "@phosphor-icons/react";
import { TABS, type TabId } from "./tabs";
import type { PauseSite } from "../ipc/desktop";

export function Rail({ active, onSelect, hidden = [], musicOpen = false, onMusic, pauseOpen = null, onPause, mediaHidden = false }: { active: TabId | null; onSelect: (id: TabId) => void; hidden?: TabId[]; musicOpen?: boolean; onMusic: () => void; pauseOpen?: PauseSite | null; onPause: (site: PauseSite) => void; mediaHidden?: boolean }) {
  // Up/Down move focus between rail items (roving tabindex).
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + d + items.length) % items.length]?.focus();
    e.preventDefault();
  };
  return (
    <nav className="rail" aria-label="Onglets" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => {
        if (hidden.includes(t.id)) return null;
        const on = t.id === active;
        return (
          <Fragment key={t.id}>
          {t.id === "settings" && !mediaHidden && (
            <button
              id="rail-music"
              type="button"
              className={`rail__item rail__item--sep${musicOpen ? " rail__item--active" : ""}`}
              aria-label="Musique"
              aria-pressed={musicOpen}
              title="Musique"
              tabIndex={-1}
              onClick={onMusic}
            >
              <MusicNotes size="var(--icon-md)" weight={musicOpen ? "fill" : "regular"} aria-hidden="true" />
            </button>
          )}
          {t.id === "settings" && !mediaHidden && (
            <button
              type="button"
              className={`rail__item${pauseOpen === "shorts" ? " rail__item--active" : ""}`}
              aria-label="YouTube Shorts"
              aria-pressed={pauseOpen === "shorts"}
              title="YouTube Shorts"
              tabIndex={-1}
              onClick={() => onPause("shorts")}
            >
              <YoutubeLogo size="var(--icon-md)" weight={pauseOpen === "shorts" ? "fill" : "regular"} aria-hidden="true" />
            </button>
          )}
          {t.id === "settings" && !mediaHidden && (
            <button
              type="button"
              className={`rail__item${pauseOpen === "instagram" ? " rail__item--active" : ""}`}
              aria-label="Instagram"
              aria-pressed={pauseOpen === "instagram"}
              title="Instagram"
              tabIndex={-1}
              onClick={() => onPause("instagram")}
            >
              <InstagramLogo size="var(--icon-md)" weight={pauseOpen === "instagram" ? "fill" : "regular"} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={`rail__item${on ? " rail__item--active" : ""}${t.id === "settings" ? " rail__item--end" : ""}`}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            title={`${t.label} (Ctrl+${i + 1})`}
            tabIndex={on || (!active && t.id === "chat") ? 0 : -1}
            onClick={() => onSelect(t.id)}
          >
            <t.icon size="var(--icon-md)" weight={on ? "fill" : "regular"} aria-hidden="true" />
          </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
