import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Image as ImageIcon, Plus, Stop, PaperPlaneRight, X } from "@phosphor-icons/react";
import type { ImageIn } from "../../ipc/claude";
import { clipboardImage } from "../../ipc/desktop";
import { projectFiles } from "../../ipc/project";
import { MAX_IMAGES, pickImages, sizeLabel, toAttachment, type Attachment } from "./images";
import { applyMention, filterCommands, findTrigger } from "./mention";
import { insertAt } from "./menu";

type Props = {
  id: string; // unique per composer (ids of the autocomplete list)
  cwd: string;
  commands: string[];
  ready: boolean; // a message may be sent right now (state and project known)
  busy: boolean; // a reply is running: show « Arrêter »
  onSend: (text: string, images: ImageIn[]) => void;
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
  const [images, setImages] = useState<Attachment[]>([]); // pictures pasted for the next message
  const [note, setNote] = useState<string | null>(null);
  const lastId = useRef(0);
  const lastPaste = useRef(0); // time of the last native clipboard read: one Ctrl+V fires a keydown and a paste event
  const readId = useRef(0); // a newer paste cancels the answer of an older native read

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
  // Pasted pictures join the next message; a refused one says why. shortcut: no downscaling, 5 MB each (the core refuses more).
  const attach = (files: File[]) => {
    const { ok, problem } = pickImages(files, images.length);
    setNote(problem);
    Promise.all(ok.map((f) => toAttachment(f, ++lastId.current))).then(
      (added) => setImages((cur) => [...cur, ...added].slice(0, MAX_IMAGES)),
      () => setNote("Image illisible."),
    );
  };
  // WebKitGTK does not give a copied screenshot to the paste event, so the core reads the clipboard (clipboard_image).
  // It answers null when the clipboard holds text, which then pastes as usual.
  const pasteNative = () => {
    const now = Date.now();
    if (now - lastPaste.current < 600) return;
    lastPaste.current = now;
    if (images.length >= MAX_IMAGES) return setNote(`${MAX_IMAGES} images au plus par message.`);
    const mine = ++readId.current;
    clipboardImage().then(
      (img) => {
        if (!img || mine !== readId.current) return;
        setNote(null);
        setImages((cur) => [...cur, { id: ++lastId.current, name: "", bytes: img.bytes, mediaType: img.mediaType, data: img.data }].slice(0, MAX_IMAGES));
      },
      (e) => setNote(typeof e === "string" ? e : "Image illisible."),
    );
  };
  const send = () => {
    const text = draft.trim();
    if (!ready || !text) return;
    setDraft("");
    setCaret(0);
    onSend(text, images.map(({ mediaType, data }) => ({ mediaType, data })));
    setImages([]);
    setNote(null);
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
        {images.length > 0 && (
          <ul className="composer__images" aria-label="Images jointes">
            {images.map((a, i) => (
              <li key={a.id} className="composer__image">
                <ImageIcon size="var(--icon-sm)" aria-hidden="true" />
                <span>Image {i + 1}</span>
                <span className="composer__image-size">{sizeLabel(a.bytes)}</span>
                <button type="button" aria-label={`Retirer l'image ${i + 1}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== a.id))}>
                  <X size="var(--icon-sm)" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && <p className="composer__note" role="status">{note}</p>}
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
          onPaste={(e) => {
            // Text wins: a copied cell or web page keeps pasting as text. A picture alone (a screenshot) is attached.
            if (e.clipboardData.getData("text/plain")) return;
            const files = [...e.clipboardData.files];
            if (files.some((f) => f.type.startsWith("image/"))) {
              e.preventDefault();
              readId.current++; // the page got the picture itself: drop a native read still running
              lastPaste.current = Date.now();
              attach(files);
            } else pasteNative();
          }}
          onKeyDown={(e) => {
            if (((e.ctrlKey || e.metaKey) && e.code === "KeyV") || (e.shiftKey && e.code === "Insert")) pasteNative();
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
