"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { THEME_COOKIE, type ThemePref } from "@/lib/theme";

type ThemeContextValue = {
  /** What the visitor picked. */
  pref: ThemePref;
  /** What is on screen: "system" resolved through the device setting. */
  resolved: "light" | "dark";
  setPref: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(initial);
  const deviceDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  const resolved = pref === "system" ? (deviceDark ? "dark" : "light") : pref;

  const setPref = useCallback((next: ThemePref) => {
    document.documentElement.dataset.theme = next;
    // A year; not sensitive, so readable by scripts. SameSite=Lax like the rest of the app.
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setPrefState(next);
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** "light" or "dark", whatever is on screen now. Canvas charts rebuild when it changes. */
export function useResolvedTheme(): "light" | "dark" {
  return useTheme().resolved;
}
