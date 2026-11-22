/* THE THREE THEMES, in the order the dots show them, all dark. Black is the default, purple second.
   There is no light theme; a browser that saved one falls back to black. The swatch is
   the card tone of each theme, so a dot looks like the surface it switches to. THEME_META is the darkest
   ground, used for the browser's theme-color so the phone status bar matches the page.

   THEME_BOOT runs in <head> before the page paints. Without it a saved theme would load as black for a
   moment and then switch, which reads as a flash on every page load. */
export const THEMES = [
  ["black", "#161616", "Black"],
  ["purple", "#1E0630", "Purple"],
  ["green", "#0A261A", "Dark green"],
];
export const DEFAULT_THEME = "purple";
/* Oct 2026: purple is the only theme. The others remain defined so an old saved choice is ignored cleanly. */
export const THEME_META = { black: "#000000", purple: "#0D0014", green: "#03110A" };
export const THEME_BOOT = `(function(){try{document.documentElement.dataset.theme="purple";localStorage.removeItem("zeus.theme");}catch(e){}})();`;
