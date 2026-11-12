import { useEffect, useId, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { initialIndex, menuKey } from "./menu";

export type MenuItem = { value: string; label: string; title?: string };
type Props = {
  label: string; // accessible name of the menu
  text: string; // visible text of the trigger
  items: MenuItem[];
  value: string | null;
  onSelect: (value: string) => void;
  action?: { label: string; run: () => void }; // extra entry after the items (e.g. « Parcourir… »)
  disabled?: boolean;
  title?: string;
};

/** Plain-text trigger opening a small menu (role="menu"), fully keyboard driven. */
export function Menu({ label, text, items, value, onSelect, action, disabled, title }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const all: MenuItem[] = action ? [...items, { value: "", label: action.label }] : items;
  const isAction = (i: number) => !!action && i === items.length;

  const show = (at?: number) => {
    setIndex(at ?? initialIndex(items.map((i) => i.value), value));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (open) rows.current[index]?.focus();
  }, [open, index]);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);

  const pick = (i: number) => {
    if (isAction(i)) action?.run();
    else onSelect(items[i].value);
    close(true);
  };

  return (
    <span ref={root} className="tmenu">
      <button
        ref={trigger}
        type="button"
        className="tmenu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label} : ${text}`}
        title={title ?? label}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show(e.key === "ArrowUp" ? all.length - 1 : undefined);
          }
        }}
      >
        <span className="tmenu__text">{text}</span>
        <CaretDown size="var(--icon-sm)" aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="tmenu__list" role="menu" aria-label={label}>
          {all.map((it, i) => (
            <button
              key={it.value || "action"}
              ref={(el) => { rows.current[i] = el; }}
              type="button"
              role={isAction(i) ? "menuitem" : "menuitemradio"}
              aria-checked={isAction(i) ? undefined : it.value === value}
              className="tmenu__item"
              tabIndex={i === index ? 0 : -1}
              title={it.title}
              onClick={() => pick(i)}
              onKeyDown={(e) => {
                const m = menuKey(e.key, index, all.length);
                if (!m) return;
                e.preventDefault();
                if (m === "select") pick(index);
                else if (m === "close") close(true);
                else setIndex(m.index);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
