import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Brain, CaretDown, CaretRight, DotsThree, FileText, Folder, MagnifyingGlass } from "@phosphor-icons/react";
import { Markdown } from "@/components/ui/ai-thinking-and-tool-calls";
import { sessionsList, settingsGet } from "../../ipc/claude";
import { usageSummary } from "../../ipc/usage";
import { vaultAppendJournal, vaultList, vaultOpen, vaultRead, vaultRecent, vaultSearch, type VaultFolder, type VaultHit, type VaultNote } from "../../ipc/vault";
import { ancestors, buildRecap, extractWikilinks, linkCandidates, relativeDate, resolveLink, treeRows } from "./lib";
import "./brain.css";

const msg = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
const NOT_SET = "Vault Obsidian non configuré";
const RECENT = 20;
const baseName = (p: string) => (p.split("/").pop() ?? p).replace(/\.md$/i, "");

// App listens for "atelier:goto" and switches tab (views have no direct access to the shell).
const openSettings = () => window.dispatchEvent(new CustomEvent("atelier:goto", { detail: "settings" }));

type Scope = "recent" | "project" | "vault";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "recent", label: "Récents" },
  { id: "project", label: "Projet" },
  { id: "vault", label: "Tout" },
];

export default function SecondBrain() {
  const [unset, setUnset] = useState(false);
  const [ready, setReady] = useState(false);
  const [project, setProject] = useState("");
  const [scope, setScope] = useState<Scope>("recent");
  const [recent, setRecent] = useState<VaultNote[]>([]);
  const [loaded, setLoaded] = useState<Map<string, VaultFolder>>(new Map());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const asked = useRef(new Set<string>()); // folders already requested, so a fast double click loads once
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VaultHit[] | null>(null);
  const [current, setCurrent] = useState<VaultNote | null>(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [recap, setRecap] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  const fail = (e: unknown) => (msg(e).includes(NOT_SET) ? setUnset(true) : setErr(msg(e)));

  /** Loads one folder level ("" = vault root) once. */
  const loadFolder = useCallback((path: string) => {
    if (asked.current.has(path)) return;
    asked.current.add(path);
    vaultList(path || null).then(
      (f) => setLoaded((m) => new Map(m).set(path, f)),
      (e) => {
        asked.current.delete(path);
        fail(e);
      },
    );
  }, []);

  useEffect(() => {
    settingsGet()
      .then((cfg) => {
        if (!cfg.vaultPath) return setUnset(true);
        setProject(cfg.vaultProject);
        loadFolder("");
        return vaultRecent(RECENT).then(setRecent);
      })
      .catch(fail)
      .finally(() => setReady(true));
  }, [loadFolder]);

  const toggle = (path: string) => {
    const next = new Set(open);
    if (next.delete(path)) return setOpen(next);
    setOpen(next.add(path));
    loadFolder(path);
  };

  const show = async (n: VaultNote) => {
    setCurrent(n);
    setHits(null);
    setRecap(null);
    setErr(null);
    // Unfold the note's folders so the tree shows where it lives.
    const up = ancestors(n.path);
    if (up.length) setOpen((o) => new Set([...o, ...up]));
    up.forEach(loadFolder);
    try {
      setBody(await vaultRead(n.path));
    } catch (e) {
      setBody("");
      fail(e);
    }
  };

  const known = () => [...recent, ...[...loaded.values()].flatMap((f) => f.notes)];

  /** Follows a [[link]]: known notes first, then likely paths, then a vault search on the name. */
  const follow = async (target: string) => {
    const hit = resolveLink(target, known());
    if (hit) return show(hit);
    for (const path of linkCandidates(target, current?.path ?? "")) {
      try {
        const text = await vaultRead(path);
        setCurrent({ path, title: baseName(path), modified: 0 });
        setBody(text);
        setErr(null);
        return;
      } catch {
        // not there, try the next candidate
      }
    }
    const name = baseName(target.split("#")[0]).toLowerCase();
    try {
      const found = name.length >= 2 ? (await vaultSearch(name)).find((h) => baseName(h.path).toLowerCase() === name) : undefined;
      if (found) return show({ path: found.path, title: found.title, modified: 0 });
    } catch {
      // fall through to the message below
    }
    setErr(`Note introuvable : ${target}`);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setHits(null);
    try {
      setHits(await vaultSearch(q));
      setRecap(null);
    } catch (x) {
      fail(x);
    }
  };

  const closeMenu = () => {
    menu.current?.removeAttribute("open");
    menu.current?.querySelector("summary")?.focus();
  };
  const prepareRecap = async () => {
    closeMenu();
    setInfo(null);
    try {
      const [s, u] = await Promise.all([sessionsList(), usageSummary(1)]);
      setRecap(buildRecap(s, u));
      setHits(null);
    } catch (e) {
      fail(e);
    }
  };
  const confirmRecap = async () => {
    if (!recap) return;
    try {
      await vaultAppendJournal(recap);
      setRecap(null);
      setInfo("Récap ajouté au journal du projet.");
    } catch (e) {
      fail(e);
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
  if (!ready) return <div className="brain__empty" role="status">Chargement…</div>;

  const { text, links } = extractWikilinks(body);
  const root = scope === "project" ? project : "";
  const rows = scope === "recent" ? [] : treeRows(root, loaded, open);

  return (
    <div className="brain">
      <header className="brain__top">
        <form onSubmit={search} role="search" className="brain__search">
          <MagnifyingGlass size="var(--icon-sm)" aria-hidden="true" />
          <input
            type="search"
            aria-label="Chercher dans le vault"
            placeholder="Chercher dans le vault"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setHits(null);
            }}
          />
        </form>
        {info && <span role="status" className="brain__meta">{info}</span>}
        <details ref={menu} className="brain__menu" onKeyDown={(e) => e.key === "Escape" && closeMenu()}>
          <summary aria-label="Plus d'actions" title="Plus d'actions">
            <DotsThree size="var(--icon-md)" aria-hidden="true" />
          </summary>
          <div className="brain__menu-list">
            <button type="button" onClick={() => void prepareRecap()}>Préparer le récap du jour</button>
          </div>
        </details>
      </header>

      <div className="brain__cols">
        <nav className="brain__side" aria-label="Vault">
          <div className="brain__scopes" role="group" aria-label="Afficher">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={scope === s.id}
                disabled={s.id === "project" && !project}
                title={s.id === "project" ? project || "Aucun dossier projet réglé" : undefined}
                onClick={() => {
                  setScope(s.id);
                  if (s.id === "project") loadFolder(project);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul className="brain__tree">
            {scope === "recent"
              ? recent.map((n) => (
                  <li key={n.path}>
                    <button type="button" className="brain__row" aria-current={current?.path === n.path} onClick={() => void show(n)} title={n.path}>
                      <span className="brain__row-name">{n.title}</span>
                      <span className="brain__row-date">{relativeDate(n.modified)}</span>
                    </button>
                  </li>
                ))
              : rows.map((r) => (
                  <li key={r.path}>
                    {r.kind === "folder" ? (
                      <button type="button" className="brain__row brain__row--folder" style={{ paddingLeft: `calc(var(--space-3) + ${r.depth} * var(--space-5))` }} aria-expanded={r.open} onClick={() => toggle(r.path)}>
                        {r.open ? <CaretDown size="var(--icon-sm)" aria-hidden="true" /> : <CaretRight size="var(--icon-sm)" aria-hidden="true" />}
                        <Folder size="var(--icon-sm)" aria-hidden="true" />
                        <span className="brain__row-name">{r.name}</span>
                        {r.loading && <span className="sr-only">Chargement</span>}
                      </button>
                    ) : (
                      <button type="button" className="brain__row" style={{ paddingLeft: `calc(var(--space-3) + ${r.depth} * var(--space-5) + var(--icon-sm) + var(--space-2))` }} aria-current={current?.path === r.path} onClick={() => void show(r.note)}>
                        <FileText size="var(--icon-sm)" aria-hidden="true" />
                        <span className="brain__row-name">{r.name}</span>
                      </button>
                    )}
                  </li>
                ))}
            {scope === "recent" && recent.length === 0 && <li className="brain__meta brain__pad">Aucune note récente.</li>}
            {scope !== "recent" && loaded.has(root) && rows.length === 0 && <li className="brain__meta brain__pad">Dossier vide.</li>}
          </ul>
        </nav>

        <section className="brain__main" aria-label="Lecture">
          {err && <p role="alert" className="brain__err">{err}</p>}
          {recap ? (
            <article className="brain__read">
              <h1>Récap du jour</h1>
              <p className="brain__meta">Il sera ajouté en tête du journal du projet.</p>
              <pre className="brain__preview">{recap}</pre>
              <div className="brain__bar">
                <button type="button" className="brain__btn brain__btn--primary" onClick={() => void confirmRecap()}>Ajouter au journal</button>
                <button type="button" className="brain__btn" onClick={() => setRecap(null)}>Annuler</button>
              </div>
            </article>
          ) : hits ? (
            <section className="brain__read" aria-label="Résultats">
              <h1 className="brain__results-title">{hits.length === 0 ? "Aucun résultat" : hits.length === 1 ? "1 résultat" : `${hits.length} résultats`}</h1>
              <ul className="brain__hits">
                {hits.map((h) => (
                  <li key={`${h.path}:${h.line}`}>
                    <button type="button" className="brain__hit" onClick={() => void show({ path: h.path, title: h.title, modified: 0 })}>
                      <span className="brain__hit-title">{h.title}</span>
                      <span className="brain__hit-excerpt">{h.excerpt}</span>
                      <span className="brain__hit-path">{h.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : current ? (
            <article className="brain__read">
              <div className="brain__note-head">
                <h1>{current.title}</h1>
                <button type="button" className="brain__icon" aria-label="Ouvrir dans Obsidian" title="Ouvrir dans Obsidian" onClick={() => vaultOpen(current.path).catch(fail)}>
                  <ArrowSquareOut size="var(--icon-sm)" aria-hidden="true" />
                </button>
              </div>
              <p className="brain__meta">{current.modified > 0 ? `Modifiée ${relativeDate(current.modified)}` : current.path}</p>
              <div className="brain__body">
                <Markdown text={text} />
              </div>
              {links.length > 0 && (
                <nav className="brain__links" aria-label="Liens de la note">
                  <h2>Liens</h2>
                  <ul>
                    {links.map((l) => (
                      <li key={`${l.target}|${l.label}`}>
                        <button type="button" onClick={() => void follow(l.target)}>{l.label}</button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </article>
          ) : (
            <div className="brain__empty">
              <Brain size="var(--icon-lg)" aria-hidden="true" />
              <p>Choisis une note à gauche, ou cherche dans tout le vault.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
