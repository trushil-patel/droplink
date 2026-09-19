export type ThemePreference = "system" | "light" | "dark";
export function parseTheme(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(preference: ThemePreference, prefersDark: boolean) {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}
export const themeBootstrap = `(function(){var p='system';try{p=localStorage.getItem('droplink-theme')||'system'}catch(e){}var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=p==='light'||p==='dark'?p:(dark?'dark':'light');})();`;
