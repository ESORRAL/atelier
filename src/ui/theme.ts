export type Theme = "dark" | "light" | "system";

const KEY = "atelier.theme";

export function getTheme(storage: Pick<Storage, "getItem"> = localStorage): Theme {
  try {
    const v = storage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

/** Persists the choice and applies it to <html>; "system" removes the override. */
export function setTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
  root: Pick<HTMLElement, "setAttribute" | "removeAttribute"> = document.documentElement,
): void {
  try {
    if (theme === "system") storage.removeItem(KEY);
    else storage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
