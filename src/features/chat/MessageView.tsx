import { memo, useState } from "react";
import Markdown from "react-markdown";
import { CaretDown, CaretRight, XCircle } from "@phosphor-icons/react";
import { Tally } from "../../ui/Tally";
import type { Block, ChatMessage, ToolStatus } from "./reduce";

// Links stay plain text with the URL visible (not clickable for now). Raw HTML is never rendered.
const components = {
  // Remote images are never loaded: shown as text.
  img: ({ src, alt }: { src?: string; alt?: string }) => <span className="md-link">[image : {alt || "sans description"} — {src}]</span>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <span className="md-link">
      {children} ({href})
    </span>
  ),
};
const Md = memo(({ text }: { text: string }) => <Markdown components={components}>{text}</Markdown>);

export function summarizeInput(input: unknown): string {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const k of ["command", "file_path", "path", "pattern", "url", "query", "description"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  const j = JSON.stringify(input ?? "");
  return j.length > 120 ? j.slice(0, 120) + "…" : j;
}

function StatusLabel({ status }: { status: ToolStatus }) {
  if (status === "denied") {
    return (
      <span className="tool-denied">
        <XCircle size="var(--icon-sm)" aria-hidden="true" /> Refusé
      </span>
    );
  }
  return <Tally state={status === "running" ? "running" : status === "done" ? "done" : "failed"} />;
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const Caret = open ? CaretDown : CaretRight;
  return (
    <div className="thinking">
      <button type="button" className="thinking__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Caret size="var(--icon-sm)" aria-hidden="true" /> {live ? "Réflexion…" : "Réflexion"}
      </button>
      {open && <p className="thinking__text">{text || "Aucun texte de réflexion n'est exposé."}</p>}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "text") return <div className="md"><Md text={block.text} /></div>;
  if (block.type === "thinking") return <Thinking text={block.text} />;
  return (
    <div className="tool-card">
      <span className="tool-card__name">{block.name}</span>
      <code className="tool-card__input">{summarizeInput(block.input)}</code>
      <StatusLabel status={block.status} />
    </div>
  );
}

// Memoized: only the message whose object changed (the one streaming) re-renders.
export const MessageView = memo(({ message }: { message: ChatMessage }) => {
  if (message.role === "user") {
    return (
      <article className="msg msg--user">
        <h3 className="sr-only">Toi</h3>
        <p className="msg__text">{message.text}</p>
      </article>
    );
  }
  const running = message.status === "running";
  return (
    <article className="msg msg--claude" aria-busy={running}>
      <h3 className="msg__who">
        <span className="msg__lamp" aria-hidden="true" />
        Claude
      </h3>
      {message.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      {message.live?.kind === "thinking" && <Thinking text={message.live.text} live />}
      {message.live?.kind === "text" && (
        <div className="md md--live">
          <Md text={message.live.text} />
          <span className="cursor" aria-hidden="true">▍</span>
        </div>
      )}
      {message.status === "stopped" && <p className="msg__stopped">Arrêté</p>}
    </article>
  );
});
