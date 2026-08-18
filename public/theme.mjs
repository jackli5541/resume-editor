const THEME_STORAGE_KEY = "qingjianli.theme";

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function refreshThemeButtons() {
  const dark = currentTheme() === "dark";
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    const label = dark ? "切换为浅色模式" : "切换为深色模式";
    button.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
    button.setAttribute("aria-label", label);
    button.title = label;
    button.setAttribute("aria-pressed", String(dark));
  });
}

export function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0e1116" : "#12a77d");
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* 隐私模式下可能无法写入 */ }
  refreshThemeButtons();
}

export function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
}
