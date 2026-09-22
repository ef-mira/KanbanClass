import { useEffect, useState, useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";

function readPref(): ThemePref {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function useThemePref(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readPref);
  useEffect(() => {
    const el = document.documentElement;
    if (pref === "system") delete el.dataset.theme;
    else el.dataset.theme = pref;
    try {
      if (pref === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", pref);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    window.dispatchEvent(new Event("themechange"));
  }, [pref]);
  return [pref, setPref];
}

const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function subscribe(cb: () => void) {
  mq?.addEventListener("change", cb);
  window.addEventListener("themechange", cb);
  return () => {
    mq?.removeEventListener("change", cb);
    window.removeEventListener("themechange", cb);
  };
}

/** Resolved dark/light, for the few places that compute colors in JS (subject tints). */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : !!mq?.matches;
  });
}
