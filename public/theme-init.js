// Keep this as a classic, head-loaded script so the saved theme is applied
// before the page is painted without requiring CSP unsafe-inline.
(function () {
  try {
    var saved = localStorage.getItem("qingjianli.theme");
    var dark = saved
      ? saved === "dark"
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (_error) {
    document.documentElement.dataset.theme = "light";
  }
})();
