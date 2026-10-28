"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as KEY } from "./theme-script";

export type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") {
      apply("system");
      listener();
    }
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
  };
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

/** Current theme preference, the resolved light/dark value, and a setter. */
export function useTheme(): { theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const resolved = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light" as const,
  );
  return { theme, resolved, setTheme };
}
