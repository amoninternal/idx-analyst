// Light, dark, or follow the device. Saved in a cookie so the server renders the right theme
// on the first paint (no flash, and no inline script for the Content Security Policy to allow).

export type ThemePref = "light" | "dark" | "system";

export const THEME_COOKIE = "idx_theme";

export function parseTheme(raw: string | undefined | null): ThemePref {
  return raw === "dark" || raw === "system" ? raw : "light";
}
