import { useEffect, useRef, useState } from "react";
import { execute, filterCommands, moveIndex, type Command } from "./palette";

export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = filterCommands(commands, query);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    document.getElementById(`palette-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const run = () => {
    onClose();
    execute(commands, query, active);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") setActive(moveIndex(active, e.key === "ArrowDown" ? 1 : -1, results.length));
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) run();
    else if (e.key === "Tab") { /* the input is the only focus stop: keep focus inside */ }
    else return;
    e.preventDefault();
  };

  let lastGroup = "";
  return (
    <div className="palette__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes" onKeyDown={onKeyDown}>
        <input
          ref={input}
          className="palette__input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results.length ? `palette-opt-${active}` : undefined}
          aria-label="Rechercher une commande"
          placeholder="Rechercher un onglet ou une action…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <ul id="palette-list" className="palette__list" role="listbox" aria-label="Résultats">
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {head && <div className="palette__group" aria-hidden="true">{head}</div>}
                <div
                  id={`palette-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette__opt"
                  onMouseMove={() => setActive(i)}
                  onClick={run}
                >
                  <span>{c.label}</span>
                  {c.shortcut && <kbd className="kbd">{c.shortcut}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
        {results.length === 0 && <p className="palette__empty">Aucun résultat.</p>}
        <div className="sr-only" role="status">{results.length === 0 ? "Aucun résultat" : `${results.length} résultats`}</div>
      </div>
    </div>
  );
}
