import { useEffect, useId, useState } from "react";
import { settingsGet, settingsSet, type PermissionMode, type Settings as Cfg } from "../../ipc/claude";
import { pickFolder } from "../../ipc/desktop";
import { getTheme, setTheme, type Theme } from "../../ui/theme";
import { normalize, validateSettings } from "./validate";
import "./settings.css";

const MODEL_LABELS: [string, string][] = [
  ["", "Celui de Claude Code"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
  ["fable", "Fable"],
];
const MODE_LABELS: [PermissionMode, string][] = [
  ["default", "Demander à chaque fois"],
  ["acceptEdits", "Accepter les modifications de fichiers"],
  ["plan", "Plan seulement"],
];
const THEME_LABELS: [Theme, string][] = [
  ["system", "Système"],
  ["dark", "Sombre"],
  ["light", "Clair"],
];

type Status = { ok: boolean; text: string } | null;
const msg = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

export default function Settings() {
  const id = useId();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsGet().then(setCfg, (e) => setStatus({ ok: false, text: msg(e) }));
  }, []);

  if (!cfg) return <div className="settings" role="status">{status ? status.text : "Chargement…"}</div>;

  const patch = (p: Partial<Cfg>) => {
    setCfg({ ...cfg, ...p });
    setStatus(null);
  };

  const save = async () => {
    const next = normalize(cfg);
    const err = validateSettings(next);
    if (err) return setStatus({ ok: false, text: err });
    setBusy(true);
    try {
      await settingsSet(next);
      setCfg(next);
      setStatus({ ok: true, text: "Réglages enregistrés." });
    } catch (e) {
      setStatus({ ok: false, text: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <h1>Réglages</h1>

      <label className="settings__field">
        Chemin du CLI Claude
        <input
          value={cfg.claudePath ?? ""}
          onChange={(e) => patch({ claudePath: e.target.value })}
          placeholder="Vide : cherché dans le PATH"
          aria-describedby={`${id}-path`}
          spellCheck={false}
        />
        <span id={`${id}-path`} className="settings__hint">Laisse vide pour utiliser le CLI trouvé dans le PATH, ou donne un chemin absolu.</span>
      </label>

      <label className="settings__field">
        Modèle par défaut
        <select value={cfg.defaultModel ?? ""} onChange={(e) => patch({ defaultModel: e.target.value || null })}>
          {MODEL_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>

      <label className="settings__field">
        Mode de permission par défaut
        <select value={cfg.defaultPermissionMode} onChange={(e) => patch({ defaultPermissionMode: e.target.value as PermissionMode })}>
          {MODE_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>

      <label className="settings__field">
        Thème
        <select value={theme} onChange={(e) => { const t = e.target.value as Theme; setTheme(t); setThemeState(t); }}>
          {THEME_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>

      <div className="settings__field">
        <label htmlFor={`${id}-vault`}>Vault Obsidian</label>
        <div className="settings__row">
          <input
            id={`${id}-vault`}
            value={cfg.vaultPath ?? ""}
            onChange={(e) => patch({ vaultPath: e.target.value })}
            placeholder="Aucun vault choisi"
            spellCheck={false}
          />
          <button
            type="button"
            className="settings__btn"
            onClick={() => pickFolder().then((d) => d && patch({ vaultPath: d }), (e) => setStatus({ ok: false, text: msg(e) }))}
          >
            Parcourir…
          </button>
        </div>
      </div>

      <label className="settings__field">
        Dossier du projet dans le vault
        <input value={cfg.vaultProject} onChange={(e) => patch({ vaultProject: e.target.value })} spellCheck={false} />
        <span className="settings__hint">Relatif au vault, par exemple « 01 - Projets/Atelier ».</span>
      </label>

      <fieldset className="settings__field">
        <legend>Dossiers récents</legend>
        {cfg.recentCwds.length === 0 ? (
          <span className="settings__hint">Aucun dossier récent.</span>
        ) : (
          <ul className="settings__recent">
            {cfg.recentCwds.map((d) => (
              <li key={d}>
                <span>{d}</span>
                <button type="button" className="settings__btn" aria-label={`Retirer ${d}`} onClick={() => patch({ recentCwds: cfg.recentCwds.filter((x) => x !== d) })}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <button type="submit" className="settings__btn settings__btn--primary" disabled={busy}>Enregistrer</button>
      <p role="status" className={`settings__status ${status ? (status.ok ? "settings__status--ok" : "settings__status--err") : ""}`}>{status?.text}</p>
    </form>
  );
}
