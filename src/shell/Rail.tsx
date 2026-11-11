import { TABS, type TabId } from "./tabs";

export function Rail({ active, onSelect, hidden = [] }: { active: TabId | null; onSelect: (id: TabId) => void; hidden?: TabId[] }) {
  // Up/Down move focus between rail items (roving tabindex).
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + d + items.length) % items.length]?.focus();
    e.preventDefault();
  };
  return (
    <nav className="rail" aria-label="Onglets" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => {
        if (hidden.includes(t.id)) return null;
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            className={`rail__item${on ? " rail__item--active" : ""}${t.id === "music" ? " rail__item--sep" : ""}${t.id === "settings" ? " rail__item--end" : ""}`}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            title={`${t.label} (Ctrl+${i + 1})`}
            tabIndex={on || (!active && t.id === "chat") ? 0 : -1}
            onClick={() => onSelect(t.id)}
          >
            <t.icon size="var(--icon-md)" weight={on ? "fill" : "regular"} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
