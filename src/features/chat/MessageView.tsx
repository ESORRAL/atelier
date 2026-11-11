import { memo } from "react";
import { Markdown, ThinkingState } from "@/components/ui/ai-thinking-and-tool-calls";
import type { ChatMessage } from "./reduce";
import { toPhases } from "./toTrace";

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
  const phases = toPhases(message);
  return (
    <article className="msg msg--claude" aria-busy={running}>
      <h3 className="sr-only">Claude</h3>
      {phases.map((p, i) => {
        const last = i === phases.length - 1;
        return (
          <div key={i} className="flex flex-col gap-1">
            {/* Settled groups never replay the component's fake timers; the open one follows real events. */}
            {p.trace.length > 0 && <ThinkingState nodes={p.trace} autoPlay={false} live={running && last && p.message === undefined} />}
            {p.message !== undefined && (
              <div>
                <Markdown text={p.message} />
                {last && message.live?.kind === "text" && <span className="cursor" aria-hidden="true">▍</span>}
              </div>
            )}
          </div>
        );
      })}
      {message.status === "stopped" && <p className="msg__stopped">Arrêté</p>}
    </article>
  );
});
