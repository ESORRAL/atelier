import { useState } from "react";
import { Tally, type TallyState } from "../../ui/Tally";
import { getTheme, setTheme, type Theme } from "../../ui/theme";
import "./Demo.css";

const SURFACES = ["base", "surface", "raised", "overlay"] as const;
const TEXTS = ["primary", "secondary", "muted"] as const;
const SCALE = [
  ["xs", "Méta et horodatages"],
  ["sm", "Interface secondaire"],
  ["md", "Interface par défaut"],
  ["read", "Corps de conversation"],
  ["lg", "Titre de panneau"],
  ["xl", "Titre d'écran"],
  ["2xl", "Titre de morceau"],
] as const;
const STATES: TallyState[] = ["queued", "running", "waiting-permission", "review", "done", "failed"];
const NEXT: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };
const THEME_LABEL: Record<Theme, string> = { system: "Système", dark: "Sombre", light: "Clair" };

export default function Demo() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  return (
    <div className="demo">
      <button
        type="button"
        className="demo__btn"
        onClick={() => {
          const next = NEXT[theme];
          setTheme(next);
          setThemeState(next);
        }}
      >
        Thème : {THEME_LABEL[theme]}
      </button>

      <section>
        <h2>Surfaces</h2>
        <div className="demo__row">
          {SURFACES.map((s) => (
            <div key={s} className="demo__swatch" style={{ background: `var(--color-bg-${s})` }}>
              {s}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Texte</h2>
        {TEXTS.map((t) => (
          <p key={t} style={{ color: `var(--color-text-${t})` }}>
            Texte {t}
          </p>
        ))}
      </section>

      <section>
        <h2>Échelle typographique</h2>
        {SCALE.map(([k, sample]) => (
          <p key={k} style={{ fontSize: `var(--text-${k})`, lineHeight: `var(--lh-${k})` }}>
            {k} · {sample}
          </p>
        ))}
      </section>

      <section>
        <h2>Polices</h2>
        <p style={{ fontFamily: "var(--font-ui)" }}>Atkinson Hyperlegible Next : Il1 O0, interface</p>
        <p style={{ fontFamily: "var(--font-mono)" }}>Atkinson Hyperlegible Mono : Il1 O0, code</p>
      </section>

      <section>
        <h2>États</h2>
        <div className="demo__row">
          {STATES.map((s) => (
            <Tally key={s} state={s} />
          ))}
        </div>
      </section>
    </div>
  );
}
