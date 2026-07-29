import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORT_KEYS, DEFAULT_SORT, cycleSort, sortArrow } from "../lib/sorting.mjs";

/* The Players page. Its whole risk is two controls disagreeing about the sort, so most of this is about
   there being one list and one piece of state. */

test("the sort options are exactly the sortable columns, in the same order", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  // The columns are generated from SORT_KEYS, so parity is structural rather than a coincidence to check.
  assert.match(src, /\.\.\.SORT_KEYS\.map\(/, "columns must be generated from the sort list");
  const labels = SORT_KEYS.map((s) => s.label);
  assert.deepEqual(labels, ["PRICE", "xPTS", "VALUE", "x£", "FORM", "PTS LAST YEAR", "GAMETIME %", "OWNERSHIP %"],
    "and the order is the one Louis specified");
});

test("PRICE highest first is the default view", () => {
  assert.deepEqual(DEFAULT_SORT, { key: "PRICE", dir: "desc" });
});

test("a sortable key cycles highest, lowest, then back to the default", () => {
  let s = { ...DEFAULT_SORT };
  s = cycleSort(s, "XPTS");
  assert.deepEqual(s, { key: "XPTS", dir: "desc" }, "first click: highest first");
  s = cycleSort(s, "XPTS");
  assert.deepEqual(s, { key: "XPTS", dir: "asc" }, "second click: lowest first");
  s = cycleSort(s, "XPTS");
  assert.deepEqual(s, DEFAULT_SORT, "third click: back to the default PRICE view");

  // Clicking a different key starts that key's cycle rather than continuing the old one.
  s = cycleSort({ key: "FORM", dir: "asc" }, "VALUE");
  assert.deepEqual(s, { key: "VALUE", dir: "desc" });
});

test("the dropdown and the headings read one piece of state, so they cannot disagree", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  const controls = readFileSync("components/PlayerControls.jsx", "utf8");
  // Both call the same cycle function and both render the same arrow.
  assert.match(src, /setSort\(cycleSort\(sort, c\.key\)\)/, "a heading cycles the shared state");
  assert.match(controls, /setSort\(cycleSort\(sort, e\.target\.value\)\)/, "the dropdown cycles the same state");
  assert.match(src, /sortArrow\(sort, c\.key\)/, "the heading shows the direction");
  assert.match(controls, /sortArrow\(sort, s\.key\)/, "and so does the dropdown");
  assert.equal(sortArrow({ key: "XPTS", dir: "desc" }, "XPTS"), " ↓");
  assert.equal(sortArrow({ key: "XPTS", dir: "asc" }, "XPTS"), " ↑");
  assert.equal(sortArrow({ key: "PRICE", dir: "desc" }, "XPTS"), "", "an inactive column shows nothing");
});

test("every filter defaults to ANY or its full range, and RESET restores all of them", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  assert.match(src, /React\.useState\("ANY"\)/, "position defaults to ANY");
  assert.match(src, /setPrice\(priceBounds\)/, "price defaults to the full range");
  const reset = src.slice(src.indexOf("const reset = "), src.indexOf("const fmt = "));
  for (const setter of ["setQ", "setPosition", "setPrice", "setSort", "setRange", "setCompare", "setPicked"]) {
    assert.match(reset, new RegExp(setter), `RESET must clear ${setter}`);
  }
});

test("the gameweek control only appears for xPTS and never touches the fixtures", () => {
  const controls = readFileSync("components/PlayerControls.jsx", "utf8");
  assert.match(controls, /sort\.key === "XPTS" &&/, "it is conditional on the sort key");
  assert.match(controls, /val\(15, T\.xp, 700\)/, "and the figure is in the xPTS colour, because it controls xPTS");

  const src = readFileSync("app/players/page.jsx", "utf8");
  // xPTS sums the chosen range; the fixtures column asks for exactly three and does not.
  const xptsFn = src.slice(src.indexOf("const xpts = React.useCallback"), src.indexOf("const xprice ="));
  assert.match(xptsFn, /gw = gwFrom; gw <= gwTo/, "xPTS spans the selected gameweeks");
  const fixFn = src.slice(src.indexOf("const fixturesOf ="), src.indexOf("const xpts ="));
  assert.match(fixFn, /team_id, 3\)/, "the fixtures column is always three");
  assert.ok(!/gwFrom/.test(fixFn), "and never reads the slider");
});

test("VALUE and x£ measure different things", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  const value = src.slice(src.indexOf("const valueOf ="), src.indexOf("const gametimeOf ="));
  assert.match(value, /x \/ pr/, "VALUE is projected points per million");
  assert.match(value, /xpts/, "built from xPTS, so it moves with the gameweek slider");
  // x£ comes from last season's points, so it cannot move with the slider.
  const xp = src.slice(src.indexOf("const xprice = React.useMemo"), src.indexOf("const valueOf ="));
  assert.match(xp, /lastSeasonPoints/, "x£ is built from last season's points");
  assert.ok(!/gwFrom/.test(xp), "and does not read the slider");
});

test("the old filter set is gone", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  for (const gone of ["ownRange", "runRange", "rotation", "promoted", "diffs", "DIFFERENTIALS", "CLEAR ALL", "Fixture run"]) {
    assert.ok(!src.includes(gone), `${gone} should have been removed`);
  }
});

test("the Builder's player list uses the same control system as the Players page", () => {
  // The instruction is that it behaves exactly the same. Sharing the component and the sort module is the
  // only way that holds: a second bespoke sort map is how the two drifted apart before.
  const src = readFileSync("components/Candidates.jsx", "utf8");
  assert.match(src, /<PlayerControls/, "it renders the shared controls");
  assert.match(src, /readers\[sort\.key\]/, "and sorts by the same { key, dir } state shape");
  // The bespoke controls are gone.
  for (const gone of ["HIDE FLAGGED", "Up to ", "maxPrice", "hideFlagged", '"xPTS NEXT 5"']) {
    assert.ok(!src.includes(gone), `${gone} was replaced by the shared control set`);
  }
  assert.match(src, /React\.useState\("ANY"\)/, "position defaults to ANY here too");
});

test("the gameweek slider changes the numbers everywhere, including on the pitch", () => {
  /* This test existed and the bug survived it, because it only checked the LIST. The Builder pitch was handed
     ctx.scoreOf, a single-gameweek score, so dragging the range moved the list and left the shirts frozen.
     Louis reported it five times. Every surface that shows a projection must read the range-aware source. */
  const list = readFileSync("components/Candidates.jsx", "utf8");
  assert.match(list, /XPTS: \(p\) => \(xpRange \? xpRange\(p\)/, "the list sums the selected range");
  assert.match(list, /VALUE: \(p\) => \{ const x = xpRange \? xpRange\(p\)/, "and VALUE follows it");

  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(builder, /xpRange=\{xpOverHorizon\}/, "the Builder supplies the range sum to the list");
  // THE ONE THAT WAS MISSING.
  assert.match(builder, /squad=\{squad\} scoreOf=\{xpOverHorizon\}/,
    "and to the pitch, or the shirts never move");
  assert.ok(!/scoreOf=\{ctx\.scoreOf\}/.test(builder),
    "no surface may take the single-gameweek score while a range is selectable");
  assert.match(builder, /xpTotal=\{selectedTotal\}/, "the headline total follows the range too");

  const page = readFileSync("app/players/page.jsx", "utf8");
  const xpts = page.slice(page.indexOf("const xpts = React.useCallback"), page.indexOf("const xprice ="));
  assert.match(xpts, /for \(let gw = gwFrom; gw <= gwTo; gw\+\+\)/, "the Players page sums the chosen range");

  // Squad is gameweek-specific rather than a range, so its list must follow the gameweek being viewed.
  const squad = readFileSync("app/squad/SquadClient.jsx", "utf8");
  assert.match(squad, /scoreOf=\{xpOf\} bandOf=/, "the Squad list follows the gameweek on screen");
});

test("both ends of the gameweek range are settable, and they cannot cross", () => {
  /* This was two range sliders stacked on one track. The upper one covered the lower one, so the FIRST
     gameweek handle could not be grabbed at all and clicking the track jumped the LAST one. Two typed numbers
     with steppers: eight possible values, nothing to drag, nothing to overlap. The protections are the same as
     before, which is that each end is its own labelled control and the pair can never cross. */
  const c = readFileSync("components/PlayerControls.jsx", "utf8");
  assert.ok(!/type="range"[\s\S]{0,200}aria-label="(First|Last) gameweek"/.test(c),
    "the stacked sliders must be gone");
  assert.match(c, /<GwBox label="FROM" value=\{gwFrom\} min=\{firstGw\} max=\{gwTo\}/,
    "the lower end is its own control and cannot pass the upper one");
  assert.match(c, /<GwBox label="TO" value=\{gwTo\} min=\{gwFrom\} max=\{maxGw\}/,
    "and the upper end cannot pass the lower one");
  assert.match(c, /const clamp = \(v\) => Math\.max\(min, Math\.min\(max, v\)\);/,
    "typing out of range is clamped rather than accepted");
  assert.match(c, /aria-label=\{`\$\{label\} gameweek`\}/, "each box is labelled for a screen reader");
  assert.match(c, /gwFrom === gwTo \? `GW\$\{gwFrom\}` : `GW\$\{gwFrom\} to GW\$\{gwTo\}`/,
    "and it is named after the real gameweeks");
  assert.ok(!/gwCount/.test(c), "no count-based control left");
});

test("the gameweek control is named after the real gameweek and is in the xPTS colour", () => {
  const controls = readFileSync("components/PlayerControls.jsx", "utf8");
  assert.match(controls, /`GW\$\{gwFrom\}`/, "one gameweek reads GW1, not 'next one'");
  assert.match(controls, /GW\$\{gwFrom\} to GW\$\{gwTo\}/, "a range reads GW2 to GW4");
  assert.ok(!/NEXT ONE/.test(controls), "the vague wording is gone");
  assert.match(controls, /T\.xp/, "and it is the xPTS colour");
});

test("the Builder list sorts by xPTS by default, the Players page by price", () => {
  const list = readFileSync("components/Candidates.jsx", "utf8");
  assert.match(list, /useState\(\{ key: "XPTS", dir: "desc" \}\)/, "the Builder starts on xPTS");
  const page = readFileSync("app/players/page.jsx", "utf8");
  assert.match(page, /useState\(DEFAULT_SORT\)/, "the Players page keeps PRICE, as specified");
});

test("no surface reports how many players exist", () => {
  const controls = readFileSync("components/PlayerControls.jsx", "utf8");
  assert.ok(!/\{count\}/.test(controls), "the search box no longer carries a count");
  for (const f of ["app/players/page.jsx", "components/Candidates.jsx"]) {
    assert.ok(!/count=\{list\.length\}/.test(readFileSync(f, "utf8")), `${f} must not pass one`);
  }
});

test("the pitch shows the projection, not the price", () => {
  /* Price was sitting next to xPTS in the same plate at the same size, so the number you already know was
     competing with the number you came for. Price stays on the player list and the player page. */
  const bp = readFileSync("components/BuilderPitch.jsx", "utf8");
  const tile = bp.slice(0, bp.indexOf("export default function BuilderPitch"));
  assert.ok(!/Number\(p\.price\)\.toFixed\(1\)/.test(tile), "no price under a shirt on the builder pitch");
  assert.match(tile, /val\(15\.5, T\.xp, 800\)/, "the projection is the figure, in the xPTS colour");
  assert.match(tile, /isCaptain && <span style=\{val\(12, T\.tag, 700\)\}>×2</,
    "a doubled captain says so, or a 14 beside a 7 is a mystery");

  const pitch = readFileSync("components/Pitch.jsx", "utf8");
  assert.match(pitch, /export default function Pitch\(\{ squad, oppOf, scale, xpOf = null \}\)/,
    "the shared pitch takes a projection");
  assert.ok(!/Number\(p\.price\)\.toFixed\(1\)/.test(pitch), "and never prints a price on the grass");
  assert.match(pitch, /xpOf && Number\.isFinite\(Number\(xpOf\(p\)\)\) \? Number\(xpOf\(p\)\)\.toFixed\(1\) : "-"/,
    "a missing projection shows a dash rather than a wrong number");

  const dash = readFileSync("app/page.jsx", "utf8");
  assert.match(dash, /xpOf=\{xpOf\}/, "the dashboard passes one in");
  assert.match(dash, /loadModel/, "which means it loads the model");
});

test("no pitch anywhere shows a price beside a shirt", () => {
  /* I changed the dashboard pitch and the builder pitch and shipped it as done. The predicted line-ups page
     draws its own pitch and still had price next to every player, which is the screen Louis was actually
     looking at. This checks every file that draws a shirt, so a fourth pitch cannot slip through either. */
  const files = ["components/Pitch.jsx", "components/BuilderPitch.jsx", "app/lineups/LineupsClient.jsx"];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /<Kit/, `${f} should be drawing shirts`);
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    assert.ok(!/\bprice\)\.toFixed\(1\)/.test(code), `${f} still prints a price beside a shirt`);
    assert.match(code, /T\.xp/, `${f} must show the projection instead`);
  }
});
