import type { Icon } from "@phosphor-icons/react";

export function EmptyState({ icon: I, title, text }: { icon: Icon; title: string; text: string }) {
  return (
    <section className="empty" aria-label={title}>
      <I size="var(--icon-lg)" aria-hidden="true" />
      <h1 className="empty__title">{title}</h1>
      <p className="empty__text">{text}</p>
    </section>
  );
}
