import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import logoPikachu from "@/assets/logo-pikachu.png";
import logoCharmander from "@/assets/logo-charmander.png";
import logoSquirtle from "@/assets/logo-squirtle.png";

export type ThemeId = "pikachu" | "charmander" | "squirtle";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  logo: string;
  primaryHsl: string;
  ringHsl: string;
  glowRgba: string;
  swatchHex: string;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  pikachu: {
    id: "pikachu",
    label: "Pikachu",
    description: "Electric yellow on black — the original TCG Snipers look.",
    logo: logoPikachu,
    primaryHsl: "48 100% 50%",
    ringHsl: "48 100% 50%",
    glowRgba: "255,204,0,0.18",
    swatchHex: "#ffcc00",
  },
  charmander: {
    id: "charmander",
    label: "Charmander",
    description: "Fiery orange highlight inspired by Charmander's flame.",
    logo: logoCharmander,
    primaryHsl: "22 100% 55%",
    ringHsl: "22 100% 55%",
    glowRgba: "255,120,30,0.20",
    swatchHex: "#ff7a1a",
  },
  squirtle: {
    id: "squirtle",
    label: "Squirtle",
    description: "Cool baby-blue accent inspired by Squirtle's water.",
    logo: logoSquirtle,
    primaryHsl: "198 90% 70%",
    ringHsl: "198 90% 70%",
    glowRgba: "125,210,255,0.22",
    swatchHex: "#7dd2ff",
  },
};

const STORAGE_KEY = "tcg-snipers:theme";
const DEFAULT_THEME: ThemeId = "pikachu";

function isThemeId(value: unknown): value is ThemeId {
  return value === "pikachu" || value === "charmander" || value === "squirtle";
}

function applyTheme(theme: ThemeDef) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primaryHsl);
  root.style.setProperty("--ring", theme.ringHsl);
  root.style.setProperty("--sidebar-primary", theme.primaryHsl);
  root.style.setProperty("--sidebar-ring", theme.ringHsl);
  root.style.setProperty("--chart-1", theme.primaryHsl);
  root.style.setProperty("--glow-accent", theme.glowRgba);
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDef;
  setTheme: (id: ThemeId) => void;
  themes: ThemeDef[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(THEMES[themeId]);
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [themeId]);

  const setTheme = useCallback((id: ThemeId) => setThemeId(id), []);

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme: THEMES[themeId],
        setTheme,
        themes: Object.values(THEMES),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
