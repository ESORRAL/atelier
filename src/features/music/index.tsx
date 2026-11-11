import { useEffect, useState } from "react";
import { MusicNotes, Pause, Play, SkipBack, SkipForward, SpeakerHigh } from "@phosphor-icons/react";
import { musicControl, musicPlayers, musicSetVolume, type MusicAction, type PlayerInfo } from "../../ipc/music";
import { EmptyState } from "../../shell/EmptyState";
import { displaySub, displayTitle, fmtDuration, progress } from "./player";
import { useNowPlaying } from "./useNowPlaying";
import "./music.css";

export default function Music() {
  const [player, setPlayer] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const { now, refresh } = useNowPlaying(player, true);

  // The list follows the current player so the select stays accurate when one appears or leaves.
  useEffect(() => {
    musicPlayers().then(setPlayers, () => setPlayers([]));
  }, [now?.player]);

  if (!now) return <EmptyState icon={MusicNotes} title="Musique" text="Lance Spotify, VLC ou un autre lecteur." />;

  const act = (a: MusicAction) => musicControl(now.player, a).then(refresh, () => {});
  const playing = now.status === "playing";
  const pct = Math.round(progress(now) * 100);

  return (
    <section className="music" aria-label="Musique">
      <label className="music__source">
        Lecteur
        <select value={player ?? ""} onChange={(e) => setPlayer(e.target.value || null)}>
          <option value="">Automatique</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="music__card">
        <div className="music__art" aria-hidden="true"><MusicNotes size="var(--icon-lg)" /></div>
        <div className="music__body">
          <h1 className="music__title">{displayTitle(now)}</h1>
          <p className="music__sub">{displaySub(now)}</p>
          <div className="music__time">
            <span>{fmtDuration(now.positionMs)}</span>
            <progress className="music__bar" max={100} value={pct} aria-label="Progression du morceau" />
            <span>{fmtDuration(now.lengthMs)}</span>
          </div>
          <div className="music__controls">
            <button type="button" className="btn btn--ghost" aria-label="Précédent" disabled={!now.canControl || !now.canGoPrevious} onClick={() => act("previous")}>
              <SkipBack size="var(--icon-md)" aria-hidden="true" />
            </button>
            <button type="button" className="btn btn--primary" aria-label={playing ? "Pause" : "Lecture"} disabled={!now.canControl} onClick={() => act("play_pause")}>
              {playing ? <Pause size="var(--icon-md)" aria-hidden="true" /> : <Play size="var(--icon-md)" aria-hidden="true" />}
            </button>
            <button type="button" className="btn btn--ghost" aria-label="Suivant" disabled={!now.canControl || !now.canGoNext} onClick={() => act("next")}>
              <SkipForward size="var(--icon-md)" aria-hidden="true" />
            </button>
            {now.volume != null && (
              <label className="music__vol">
                <SpeakerHigh size="var(--icon-sm)" aria-hidden="true" />
                <input
                  type="range" min={0} max={100} aria-label="Volume" value={Math.round(now.volume * 100)}
                  onChange={(e) => musicSetVolume(now.player, Number(e.target.value) / 100).then(refresh, () => {})}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
