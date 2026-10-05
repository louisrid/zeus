/* THE FOUR THEMES, in the order the dots show them. Black is the default, purple second. The swatch is
   the card tone of each theme, so a dot looks like the surface it switches to. THEME_META is the darkest
   ground, used for the browser's theme-color so the phone status bar matches the page.

   THEME_BOOT runs in <head> before the page paints. Without it a saved theme would load as black for a
   moment and then switch, which reads as a flash on every page load. */
export const THEMES = [
  ["black", "#161616", "Black"],
  ["purple", "#1E0630", "Purple"],
  ["green", "#0A261A", "Dark green"],
  ["white", "#FFFFFF", "White"],
];
export const DEFAULT_THEME = "black";
export const THEME_META = { black: "#000000", purple: "#0D0014", green: "#03110A", white: "#F2F2F7" };
export const THEME_BOOT = `(function(){try{var k=${JSON.stringify(THEMES.map((t) => t[0]))};var t=localStorage.getItem("zeus.theme");if(k.indexOf(t)<0)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute("data-theme",t);var m=${JSON.stringify(THEME_META)};var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute("content",m[t]);}catch(_){document.documentElement.setAttribute("data-theme",${JSON.stringify(DEFAULT_THEME)});}})();`;
