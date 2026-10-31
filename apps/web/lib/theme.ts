export const THEME_STORAGE_KEY = "studio-theme";

export const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    const preferred = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = stored === "dark" || stored === "light" ? stored : preferred;
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;
