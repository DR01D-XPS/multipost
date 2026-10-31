"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { THEME_STORAGE_KEY } from "../lib/theme";

type Theme = "light" | "dark";

function resolveTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const isDark = theme === "dark";

  useEffect(() => {
    const nextTheme = resolveTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label="Переключить тему"
      className="inline-flex items-center gap-3 rounded-full border border-line bg-surface px-2 py-2 text-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surfaceSoft"
    >
      <span className="hidden pl-2 text-sm font-medium sm:inline">{isDark ? "Тёмная тема" : "Светлая тема"}</span>
      <span
        className={clsx(
          "relative flex h-7 w-12 items-center rounded-full border border-line px-1 transition-all duration-300",
          isDark ? "bg-[#13252b]" : "bg-[#eef2ea]"
        )}
      >
        <span
          className={clsx(
            "h-5 w-5 rounded-full shadow transition-transform duration-300",
            isDark ? "translate-x-5 bg-accent" : "translate-x-0 bg-[#f4f1e7]"
          )}
        />
      </span>
    </button>
  );
}
