export interface ThemeDef {
  id: string;
  label: string;
  dark: boolean;
  /** Two representative colors (bg, primary) for the picker swatch. */
  dot: [string, string];
}

export const themes: ThemeDef[] = [
  { id: "catppuccin-latte", label: "Catppuccin Latte", dark: false, dot: ["#eff1f5", "#1e66f5"] },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", dark: true, dot: ["#1e1e2e", "#89b4fa"] },
  { id: "solarized-light", label: "Solarized Light", dark: false, dot: ["#fdf6e3", "#268bd2"] },
  { id: "solarized-dark", label: "Solarized Dark", dark: true, dot: ["#002b36", "#268bd2"] },
  { id: "oled-dark", label: "OLED Dark", dark: true, dot: ["#000000", "#ffffff"] },
  { id: "gruvbox-light", label: "Gruvbox Light", dark: false, dot: ["#fbf1c7", "#af3a03"] },
  { id: "gruvbox-dark", label: "Gruvbox Dark", dark: true, dot: ["#282828", "#fabd2f"] },
];

export const defaultLight = "gruvbox-light";
export const defaultDark = "gruvbox-dark";

function byId(id: string): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}

/** Map a stored value (or null) to a concrete theme, honouring legacy "dark"/"light" keys. */
export function resolveTheme(saved: string | null): ThemeDef {
  if (saved === "dark") return byId(defaultDark);
  if (saved === "light") return byId(defaultLight);
  const found = saved ? themes.find((t) => t.id === saved) : undefined;
  if (found) return found;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return byId(defaultDark);
  }
  return byId(defaultLight);
}

export function applyTheme(theme: ThemeDef): void {
  document.documentElement.classList.toggle("dark", theme.dark);
  document.documentElement.dataset.theme = theme.id;
}
