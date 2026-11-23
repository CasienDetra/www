export interface ThemeDef {
  id: string;
  label: string;
  dark: boolean;
}

export const themes: ThemeDef[] = [
  { id: "light", label: "Light", dark: false },
  { id: "dark", label: "Dark", dark: true },
];

export const defaultTheme = "dark";

/**
 * One-time migration map: every pre-two-theme id (including the older
 * legacy keys "dark"/"light") resolves to a current id, so a stored value
 * from before the trim keeps working instead of falling back to default.
 */
export const themeMap: Record<string, string> = {
  dark: "dark",
  light: "light",
  "oled-dark": "dark",
  "gruvbox-dark": "dark",
  "catppuccin-mocha": "dark",
  "solarized-dark": "dark",
  "gruvbox-light": "light",
  "catppuccin-latte": "light",
  "solarized-light": "light",
};

export function applyTheme(theme: ThemeDef): void {
  document.documentElement.classList.toggle("dark", theme.dark);
  document.documentElement.dataset.theme = theme.id;
}
