import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Plus, Stop, PaperPlaneRight } from "@phosphor-icons/react";
import { projectFiles } from "../../ipc/project";
import { applyMention, filterCommands, findTrigger } from "./mention";
import { insertAt } from "./menu";

type Props = {
  id: string; // unique per composer (ids of the autocomplete list)
  cwd: string;
  commands: string[];
  ready: boolean; // a message may be sent right now (state and project known)
  busy: boolean; // a reply is running: show « Arrêter »
  onSend: (text: string) => void;
  onInterrupt: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  bar: ReactNode; // plain-text menus under the block
};

/** One rounded block (field, « + », send/stop) and the text bar under it. `/` and `@` autocompletion lives here. */
export function Composer({ id, cwd, commands, ready, busy, onSend, onInterrupt, inputRef, bar }: Props) {
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null); // draft text for which Échap closed the list

  const trigger = findTrigger(draft, caret);
  const fileQuery = trigger?.kind === "file" && cwd ? trigger.query : null;
  // Files of the project, queried 150 ms after the last keystroke following "@".
  useEffect(() => {
    if (fileQuery === null) return setFiles([]);
    let stale = false;
    const h = setTimeout(() => {
      projectFiles(cwd, fileQuery, 8).then((f) => !stale && setFiles(f), () => !stale && setFiles([]));
    }, 150);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [fileQuery, cwd]);
  const items = trigger ? (trigger.kind === "command" ? filterCommands(commands, trigger.query) : files) : [];
  const noCommands = trigger?.kind === "command" && commands.length === 0;
  const listOpen = !!trigger && dismissed !== draft && (items.length > 0 || noCommands);
  const optionId = (i: number) => `mention-${id}-${i}`;

  const setText = (text: string, at: number) => {
    setDraft(text);
    setCaret(at);
    setPick(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(at, at);
    });
  };
  const choose = (value: string) => {
    if (!trigger) return;
    const r = applyMention(draft, trigger, value);
    setText(r.text, r.caret);
  };
  const send = () => {
    const text = draft.trim();
    if (!ready || !text) return;
    setDraft("");
    setCaret(0);
    onSend(text);
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {listOpen && (
          noCommands ? (
            <p className="mention mention--hint" role="status">Les commandes apparaîtront après le premier message</p>
          ) : (
            <ul className="mention" id={`mention-list-${id}`} role="listbox" aria-label={trigger?.kind === "command" ? "Commandes" : "Fichiers du projet"}>
              {items.map((it, i) => (
                <li
                  key={it}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === pick % items.length}
                  className="mention__item"
                  onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                >
                  {trigger?.kind === "command" ? "/" : "@"}{it}
                </li>
              ))}
            </ul>
          )
        )}
        <textarea
          ref={inputRef}
          aria-label="Message à Claude"
          placeholder="Comment puis-je t'aider ?"
          value={draft}
          rows={1}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`mention-list-${id}`}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && items.length ? optionId(pick) : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart);
            setPick(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (listOpen && !e.nativeEvent.isComposing) {
              const n = items.length;
              if (e.key === "ArrowDown" && n) { e.preventDefault(); setPick((pick + 1) % n); return; }
              if (e.key === "ArrowUp" && n) { e.preventDefault(); setPick((pick - 1 + n) % n); return; }
              if ((e.key === "Enter" || e.key === "Tab") && n) { e.preventDefault(); choose(items[pick % n]); return; }
              if (e.key === "Enter") { e.preventDefault(); return; } // never send while the list is open
              if (e.key === "Escape") { e.preventDefault(); setDismissed(draft); return; }
            }
            if (e.key === "Escape" && busy) onInterrupt();
            else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer__row">
          <button
            type="button"
            className="composer__plus"
            aria-label="Joindre un fichier du projet"
            title="Joindre un fichier (@)"
            disabled={!cwd}
            onClick={() => {
              const r = insertAt(draft, inputRef.current?.selectionStart ?? draft.length);
              setDismissed(null);
              setText(r.text, r.caret);
            }}
          >
            <Plus size="var(--icon-md)" aria-hidden="true" />
          </button>
          <span className="composer__spacer" />
          {busy && (
            <button type="button" className="btn btn--ghost" onClick={onInterrupt}>
              <Stop size="var(--icon-sm)" aria-hidden="true" /> Arrêter (Échap)
            </button>
          )}
          <button type="button" className="composer__send" onClick={send} disabled={!ready || !draft.trim()} aria-label="Envoyer" title="Envoyer (Entrée)">
            <PaperPlaneRight size="var(--icon-md)" weight="fill" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="composer-bar">{bar}</div>
    </div>
  );
}
