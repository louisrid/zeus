// The mobile layer.
//
// The rule this file protects is that mobile is additive. The desktop layout is the one that already
// works, and the safest way to add a phone version is to leave the working one alone: every mobile style
// lives inside a media query, and every mobile component renders behind a viewport check. A change that
// makes the desktop layout conditional on anything is the failure mode these tests exist to catch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

test("the viewport is declared, or a phone renders the site at 980px and zooms out", () => {
  const layout = read("app/layout.jsx");
  assert.match(layout, /export const viewport/, "Next needs a viewport export to emit the meta tag");
  assert.match(layout, /width:\s*"device-width"/, "without device-width the whole layer is pointless");
  assert.match(layout, /initialScale:\s*1/);
  // Strip comments first: the file explains in prose why maximumScale is absent, and the word appearing
  // in that explanation must not read as the setting being present.
  const code = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /maximumScale\s*:|userScalable\s*:/,
    "locking zoom is an accessibility failure: someone who needs to pinch to read a price must be able to");
});

test("device detection is safe to hydrate", () => {
  const hook = read("lib/use-viewport.mjs");
  assert.match(hook, /useSyncExternalStore/,
    "a plain useEffect check renders the desktop tree first and remounts, which flashes on a phone");
  assert.match(hook, /getServerSnapshot/, "the server has no window and must answer false");
  assert.match(hook, /addListener/, "Safari below 14 has no addEventListener on MediaQueryList");
  assert.match(hook, /max-width: \$\{MOBILE_MAX_WIDTH\}px/, "one breakpoint, defined once");
});

test("the breakpoint in the hook and the CSS are the same number", () => {
  const hook = read("lib/use-viewport.mjs");
  const css = read("app/globals.css");
  const declared = Number(hook.match(/MOBILE_MAX_WIDTH = (\d+)/)[1]);
  assert.equal(declared, 767, "phones below, tablets and narrow windows above");
  assert.ok(css.includes(`@media (max-width: ${declared}px)`),
    `the CSS must break at ${declared}px too, or the rail hides while the desktop tree still renders`);
});

test("every mobile style is inside a media query, so desktop never parses one", () => {
  const css = read("app/globals.css");
  const mobileBlock = css.slice(css.indexOf("MOBILE, 767px AND BELOW"));
  // Class definitions used only by the mobile shell may sit outside, but any rule that changes an
  // existing selector must be guarded.
  for (const selector of [".fb-dash-split", ".fb-pitch-row", "input, select, textarea", "table {"]) {
    const at = mobileBlock.indexOf(selector);
    assert.ok(at > 0, `${selector} must appear in the mobile section`);
    const before = mobileBlock.slice(0, at);
    const opens = (before.match(/@media[^{]*\{/g) || []).length;
    assert.ok(opens > 0, `${selector} is not inside a media query and would affect desktop`);
  }
});

test("the desktop tree is untouched, only tagged", () => {
  // Three files gained a className and nothing else. If a style value ever changes here, the mobile work
  // has stopped being additive.
  assert.match(read("app/page.jsx"), /className="fb-dash-split" style=\{\{ display: "grid", gridTemplateColumns: "1fr 420px"/,
    "the desktop dashboard grid must keep its original inline value");
  assert.match(read("components/Pitch.jsx"), /className="fb-pitch-row" style=\{\{ display: "flex", justifyContent: "center", gap: 14/,
    "the desktop pitch must keep its original 14px gap");
  assert.match(read("components/BuilderPitch.jsx"), /className="fb-pitch-row" style=\{\{ display: "flex", justifyContent: "center", gap: 14/);
});

test("mobile components render behind a viewport check, never unconditionally", () => {
  const shell = read("components/Shell.jsx");
  assert.match(shell, /const isMobile = useIsMobile\(\)/);
  assert.match(shell, /if \(isMobile\) \{/, "the mobile shell is a branch, not a wrapper around the desktop one");
  const players = read("app/players/page.jsx");
  assert.match(players, /isMobile \? \(\s*<MobilePlayerList/,
    "the phone gets cards and the desktop keeps its table; neither is a squeezed version of the other");
});

test("the tab bar is reachable and clears the home indicator", () => {
  const nav = read("components/MobileNav.jsx");
  assert.match(nav, /aria-label="Primary"/, "the bar must be findable by assistive technology");
  assert.match(nav, /env\(safe-area-inset-bottom/,
    "without the inset the last pixels of every tab sit under the iOS gesture area and stop responding");
  /* The point is the tap target, not one particular number. Pinning 58 meant making the bar taller,
     which is strictly better for a thumb, read as a regression. The height is parsed and checked
     against the floor it exists to protect. */
  const height = Number((nav.match(/height:\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(height), "the bar must set an explicit height");
  assert.ok(height >= 44, `tab height is ${height}; 44 is the floor because thumbs are least accurate at the screen edge`);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
});

test("nothing in the mobile layer renders below the twelve pixel floor", () => {
  for (const file of ["components/MobileNav.jsx", "components/MobilePlayerList.jsx"]) {
    const src = read(file);
    for (const m of src.matchAll(/(?:lang|code|val)\((\d+(?:\.\d+)?)/g)) {
      assert.ok(Number(m[1]) >= 12, `${file} renders at ${m[1]}px; the floor is 12 and it applies on a phone too`);
    }
  }
});
