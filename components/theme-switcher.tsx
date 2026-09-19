"use client";
import { useEffect, useState } from "react";
import { parseTheme, resolveTheme, type ThemePreference } from "../lib/theme";

export default function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  useEffect(() => {
    try { setPreference(parseTheme(localStorage.getItem("droplink-theme"))); }
    catch { setPreference("system"); }
    const sync = (event: StorageEvent) => {
      if (event.key === "droplink-theme" || event.key === null) setPreference(parseTheme(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!preference) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(preference, media.matches); };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return <label className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
    <span className="hidden sm:inline">Theme</span>
    <select aria-label="Color theme" value={preference || "system"} className="theme-select rounded-xl border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      onChange={(event) => {
        const next = parseTheme(event.target.value);
        setPreference(next);
        try { localStorage.setItem("droplink-theme", next); } catch {}
      }}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>;
}
