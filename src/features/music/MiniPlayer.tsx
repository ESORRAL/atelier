import { Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";
import { musicControl, type MusicAction } from "../../ipc/music";
import { displayTitle } from "./player";
import { useNowPlaying } from "./useNowPlaying";
import "./music.css";

/** Top-bar mini player: hidden when no player runs, visible on every tab otherwise. */
export function MiniPlayer() {
  const { now, refresh } = useNowPlaying(null, true);
  if (!now) return null;
  const act = (a: MusicAction) => musicControl(now.player, a).then(refresh, () => {});
  const playing = now.status === "playing";
  return (
    <div className="mini" role="group" aria-label="Mini-lecteur">
      <button type="button" className="btn btn--ghost" aria-label="Précédent" disabled={!now.canControl || !now.canGoPrevious} onClick={() => act("previous")}>
        <SkipBack size="var(--icon-sm)" aria-hidden="true" />
      </button>
      <button type="button" className="btn btn--ghost" aria-label={playing ? "Pause" : "Lecture"} disabled={!now.canControl} onClick={() => act("play_pause")}>
        {playing ? <Pause size="var(--icon-sm)" aria-hidden="true" /> : <Play size="var(--icon-sm)" aria-hidden="true" />}
      </button>
      <button type="button" className="btn btn--ghost" aria-label="Suivant" disabled={!now.canControl || !now.canGoNext} onClick={() => act("next")}>
        <SkipForward size="var(--icon-sm)" aria-hidden="true" />
      </button>
      <span className="mini__title" title={displayTitle(now)}>{displayTitle(now)}</span>
    </div>
  );
}
