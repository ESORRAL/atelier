import { useState } from "react";
import { Tally, type TallyState } from "../../ui/Tally";
import { getTheme, setTheme, type Theme } from "../../ui/theme";
import { MessageView } from "../chat/MessageView";
import type { ChatMessage } from "../chat/reduce";
import "../chat/chat.css";
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
// Static sample conversation: shows the Chat look without a running session.
const SAMPLE: ChatMessage[] = [
  { id: "u1", role: "user", text: "dis bonjour" },
  { id: "a1", role: "assistant", status: "done", live: null, blocks: [{ type: "text", text: "Bonjour ! Que veux-tu faire ?" }] },
  { id: "u2", role: "user", text: "Lance les tests du projet." },
  {
    id: "a2",
    role: "assistant",
    status: "running",
    blocks: [
      { type: "thinking", text: "" },
      { type: "tool", id: "t1", name: "Bash", input: { command: "npm test" }, status: "done" },
      { type: "text", text: "Les **12 tests** passent. Le fichier `reduce.test.ts` couvre le streaming." },
      { type: "tool", id: "t2", name: "Read", input: { file_path: "src/features/chat/Chat.tsx" }, status: "running" },
    ],
    live: { kind: "text", text: "Je regarde maintenant le composant du Chat" },
  },
];
const STATES: TallyState[] = ["queued", "running", "waiting-permission", "review", "done", "failed"];
const NEXT: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };
const THEME_LABEL: Record<Theme, string> = { system: "Système", dark: "Sombre", light: "Clair" };

export default function Demo() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  return (
    <div className="demo">
      <button
        type="button"
        className="btn"
        onClick={() => {
          const next = NEXT[theme];
          setTheme(next);
          setThemeState(next);
        }}
      >
        Thème : {THEME_LABEL[theme]}
      </button>

      <section>
        <h2>Conversation</h2>
        <div className="chat__column demo__chat">
          {SAMPLE.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
        </div>
      </section>

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
        <p style={{ fontFamily: "var(--font-ui)" }}>Bricolage Grotesque : Il1 O0, interface et titres</p>
        <p style={{ fontFamily: "var(--font-mono)" }}>Fragment Mono : Il1 O0, code et chemins</p>
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
