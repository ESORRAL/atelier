import { useEffect, useState } from "react";
import { ArrowLeft, ArrowSquareOut, MusicNote, Pause, Play, UserCircle, VinylRecord } from "@phosphor-icons/react";
import { musicLookup, musicOpen, musicOpenUrl, musicSearch, type SearchResults } from "../../ipc/music";
import { back, canGoBack, current, duration, push, togglePreview, type View } from "./browse";
import { searchTerm } from "./panel";
import { currentPreview, playPreview, stopPreview, subscribePreview } from "./preview";

function Art({ url, fallback }: { url: string | null; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="mb__art">
      {url && !failed ? <img src={url} alt="" width={40} height={40} onError={() => setFailed(true)} /> : fallback}
    </span>
  );
}

const msg = (e: unknown) => (typeof e === "string" ? e : "Recherche impossible.");

/** Search field plus results inside the panel: results -> artist -> album, with 30 s previews. */
export function MusicBrowser({ active }: { active: boolean }) {
  const [q, setQ] = useState("");
  const [stack, setStack] = useState<View[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(currentPreview());
  const [previewError, setPreviewError] = useState(false);
  const term = searchTerm(q);
  const view = current(stack);
  void active; // the preview keeps playing when the panel closes or the window loses focus (user's choice)

  useEffect(() => subscribePreview(setPlaying), []);

  const run = (p: Promise<SearchResults>, next: Omit<View, "data">, replace = false) => {
    setBusy(true);
    setError(null);
    p.then(
      (data) => setStack((s) => (replace ? [{ ...next, data }] : push(s, { ...next, data }))),
      (e) => setError(msg(e)),
    ).finally(() => setBusy(false));
  };

  const togglePlay = (id: number, url: string) => {
    setPreviewError(false);
    if (togglePreview(playing, id) == null) return stopPreview();
    playPreview(id, url).catch(() => setPreviewError(true));
  };

  const empty = view && !view.data.artists.length && !view.data.albums.length && !view.data.songs.length;

  return (
    <section className="mb" aria-label="Recherche Apple Music">
      <form
        className="music-panel__search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (term) run(musicSearch(term, "all"), { kind: "results", title: `Résultats pour « ${term} »` }, true);
        }}
      >
        <label htmlFor="music-search" className="sr-only">Rechercher sur Apple Music</label>
        <input id="music-search" value={q} maxLength={200} placeholder="Rechercher sur Apple Music" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={!term || busy}>Rechercher</button>
      </form>
      {error && <p className="chat__error" role="alert">{error}</p>}
      {previewError && <p className="mb__note" role="status">Aperçu indisponible.</p>}
      {busy && <p className="mb__note" role="status">Chargement…</p>}
      {view && (
        <div className="mb__view">
          <div className="mb__nav">
            {canGoBack(stack) && (
              <button type="button" className="btn btn--ghost" onClick={() => setStack(back)}>
                <ArrowLeft size="var(--icon-sm)" aria-hidden="true" /> Retour
              </button>
            )}
            <h3 className="mb__title">{view.title}</h3>
          </div>
          {view.data.artists.length > 0 && (
            <>
              <h4 className="mb__group">Artistes</h4>
              <ul className="mb__list">
                {view.data.artists.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="mb__row" onClick={() => run(musicLookup(a.id, "artist_albums"), { kind: "artist", title: a.name })}>
                      <Art url={null} fallback={<UserCircle size="var(--icon-md)" aria-hidden="true" />} />
                      <span className="mb__text"><span className="mb__name">{a.name}</span>{a.genre && <span className="mb__sub">{a.genre}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {view.data.albums.length > 0 && (
            <>
              <h4 className="mb__group">Albums</h4>
              <ul className="mb__list">
                {view.data.albums.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="mb__row" onClick={() => run(musicLookup(a.id, "album_songs"), { kind: "album", title: a.name })}>
                      <Art url={a.artworkUrl} fallback={<VinylRecord size="var(--icon-md)" aria-hidden="true" />} />
                      <span className="mb__text"><span className="mb__name">{a.name}</span><span className="mb__sub">{[a.artist, a.year].filter(Boolean).join(" · ")}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {view.data.songs.length > 0 && (
            <>
              <h4 className="mb__group">Morceaux</h4>
              <ul className="mb__list">
                {view.data.songs.map((s) => (
                  <li key={s.id} className="mb__row">
                    <Art url={s.artworkUrl} fallback={<MusicNote size="var(--icon-md)" aria-hidden="true" />} />
                    <span className="mb__text"><span className="mb__name">{s.name}</span><span className="mb__sub">{[s.artist, duration(s.durationMs)].filter(Boolean).join(" · ")}</span></span>
                    {s.previewUrl && (
                      <button type="button" className="btn btn--ghost" aria-pressed={playing === s.id} aria-label={`Aperçu de ${s.name}`} onClick={() => togglePlay(s.id, s.previewUrl!)}>
                        {playing === s.id ? <Pause size="var(--icon-sm)" aria-hidden="true" /> : <Play size="var(--icon-sm)" aria-hidden="true" />}
                      </button>
                    )}
                    <button type="button" className="btn btn--ghost" aria-label={`Ouvrir ${s.name} dans Apple Music`} onClick={() => musicOpenUrl(s.url).catch((e) => setError(msg(e)))}>
                      <ArrowSquareOut size="var(--icon-sm)" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {empty && <p className="mb__note">Aucun résultat.</p>}
          {view.kind === "results" && (
            <button type="button" className="btn btn--ghost" onClick={() => musicOpen("search", term ?? q.trim()).catch((e) => setError(msg(e)))}>
              Voir tout sur Apple Music
            </button>
          )}
        </div>
      )}
    </section>
  );
}
