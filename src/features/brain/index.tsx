import { useCallback, useEffect, useState } from "react";
import { Brain } from "@phosphor-icons/react";
import { Markdown } from "@/components/ui/ai-thinking-and-tool-calls";
import { sessionsList, settingsGet } from "../../ipc/claude";
import { usageSummary } from "../../ipc/usage";
import { vaultAppendJournal, vaultList, vaultOpen, vaultRead, vaultSearch, type VaultHit, type VaultNote } from "../../ipc/vault";
import { buildRecap, extractWikilinks, relativeDate, resolveLink } from "./lib";
import "./brain.css";

const msg = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
const NOT_SET = "Vault Obsidian non configuré";

// App listens for "atelier:goto" and switches tab (views have no direct access to the shell).
const openSettings = () => window.dispatchEvent(new CustomEvent("atelier:goto", { detail: "settings" }));

export default function SecondBrain() {
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [hits, setHits] = useState<VaultHit[] | null>(null);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<VaultNote | null>(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [recap, setRecap] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [unset, setUnset] = useState(false);

  const load = useCallback(async () => {
    try {
      const cfg = await settingsGet();
      if (!cfg.vaultPath) return setUnset(true);
      setNotes(await vaultList());
    } catch (e) {
      if (msg(e).includes(NOT_SET)) setUnset(true);
      else setErr(msg(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = async (n: VaultNote) => {
    setCurrent(n);
    setErr(null);
    try {
      setBody(await vaultRead(n.path));
    } catch (e) {
      setBody("");
      setErr(msg(e));
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setHits(null);
    try {
      setHits(await vaultSearch(q));
    } catch (x) {
      setErr(msg(x));
    }
  };

  const prepareRecap = async () => {
    setInfo(null);
    try {
      const [s, u] = await Promise.all([sessionsList(), usageSummary(1)]);
      setRecap(buildRecap(s, u));
    } catch (e) {
      setErr(msg(e));
    }
  };
  const confirmRecap = async () => {
    if (!recap) return;
    try {
      await vaultAppendJournal(recap);
      setRecap(null);
      setInfo("Récap ajouté au journal.");
    } catch (e) {
      setErr(msg(e));
    }
  };

  if (unset)
    return (
      <section className="brain__empty" aria-label="Second cerveau">
        <Brain size="var(--icon-lg)" aria-hidden="true" />
        <h1>Second cerveau</h1>
        <p>Aucun vault Obsidian n'est configuré.</p>
        <button type="button" className="brain__btn brain__btn--primary" onClick={openSettings}>Ouvrir les Réglages</button>
      </section>
    );
  if (!notes) return <div className="brain__empty" role="status">{err ?? "Chargement…"}</div>;

  const { text, links } = extractWikilinks(body);

  return (
    <div className="brain">
      <aside className="brain__side" aria-label="Notes">
        <form onSubmit={search} role="search">
          <input type="search" aria-label="Chercher dans les notes" placeholder="Chercher…" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setHits(null); }} />
        </form>
        <ul className="brain__list">
          {hits
            ? hits.length === 0
              ? <li className="brain__meta">Aucun résultat.</li>
              : hits.map((h) => (
                  <li key={`${h.path}:${h.line}`}>
                    <button type="button" className="brain__item" onClick={() => void open(notes.find((x) => x.path === h.path) ?? { path: h.path, title: h.title, modified: 0 })}>
                      {h.title}
                      <span className="brain__meta">{h.excerpt}</span>
                    </button>
                  </li>
                ))
            : notes.map((n) => (
                <li key={n.path}>
                  <button type="button" className="brain__item" aria-current={current?.path === n.path} onClick={() => void open(n)}>
                    {n.title}
                    <span className="brain__meta">{relativeDate(n.modified)}</span>
                  </button>
                </li>
              ))}
        </ul>
      </aside>
      <section className="brain__main" aria-label="Note">
        <div className="brain__bar">
          <button type="button" className="brain__btn" onClick={() => void prepareRecap()}>Récap du jour</button>
          {current && <button type="button" className="brain__btn" onClick={() => vaultOpen(current.path).catch((e) => setErr(msg(e)))}>Ouvrir dans Obsidian</button>}
          {info && <span role="status">{info}</span>}
        </div>
        {err && <p role="alert" className="brain__err">{err}</p>}
        {recap && (
          <div>
            <h2>Aperçu du récap</h2>
            <pre className="brain__preview">{recap}</pre>
            <div className="brain__bar">
              <button type="button" className="brain__btn brain__btn--primary" onClick={() => void confirmRecap()}>Ajouter au journal</button>
              <button type="button" className="brain__btn" onClick={() => setRecap(null)}>Annuler</button>
            </div>
          </div>
        )}
        {current ? (
          <>
            <h1>{current.title}</h1>
            <Markdown text={text} />
            {links.length > 0 && (
              <div className="brain__links" role="group" aria-label="Liens de la note">
                {links.map((l) => {
                  const n = resolveLink(l.target, notes);
                  return (
                    <button key={`${l.target}|${l.label}`} type="button" className="brain__btn" disabled={!n} title={n ? undefined : "Note introuvable"} onClick={() => n && void open(n)}>
                      {l.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="brain__meta">Choisis une note dans la liste.</p>
        )}
      </section>
    </div>
  );
}
