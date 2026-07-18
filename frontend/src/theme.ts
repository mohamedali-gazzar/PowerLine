// App colour theme (light / dark). The effective theme is written to
// document.documentElement[data-theme]; index.html applies the stored value
// before first paint (no flash), and the neutral palette + surfaces flip via
// CSS variables (see index.css / tailwind.config.js). Offer "paper" sheets stay
// light in both themes — they're print documents.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "powerline-theme";

/** Stored choice, else the OS preference. Mirrors the inline script in index.html. */
export function initialTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "light" || s === "dark") return s;
  } catch { /* ignore */ }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch { return "light"; }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
}

/** [theme, setTheme] — persists the choice and keeps <html data-theme> in sync. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.getAttribute("data-theme") as Theme) || initialTheme(),
  );
  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  };
  useEffect(() => { applyTheme(theme); }, [theme]);
  return [theme, setTheme];
}
