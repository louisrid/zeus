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
  for (const setter of ["setQ", "setPosition", "setPrice", "setSort", "setGwCount", "setCompare", "setPicked"]) {
    assert.match(reset, new RegExp(setter), `RESET must clear ${setter}`);
  }
});

test("the gameweek slider only appears for xPTS and never touches the fixtures", () => {
  const controls = readFileSync("components/PlayerControls.jsx", "utf8");
  assert.match(controls, /sort\.key === "XPTS" &&/, "it is conditional on the sort key");
  assert.match(controls, /accentColor: T\.lock/, "and it is yellow");

  const src = readFileSync("app/players/page.jsx", "utf8");
  // xPTS reads gwCount; the fixtures column asks for exactly three and does not.
  const xptsFn = src.slice(src.indexOf("const xpts = React.useCallback"), src.indexOf("const xprice ="));
  assert.match(xptsFn, /team_id, gwCount/, "xPTS spans the selected gameweeks");
  const fixFn = src.slice(src.indexOf("const fixturesOf ="), src.indexOf("const xpts ="));
  assert.match(fixFn, /team_id, 3\)/, "the fixtures column is always three");
  assert.ok(!/gwCount/.test(fixFn), "and never reads the slider");
});

test("VALUE and x£ measure different things", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  const value = src.slice(src.indexOf("const valueOf ="), src.indexOf("const gametimeOf ="));
  assert.match(value, /x \/ pr/, "VALUE is projected points per million");
  assert.match(value, /xpts/, "built from xPTS, so it moves with the gameweek slider");
  // x£ comes from last season's points, so it cannot move with the slider.
  const xp = src.slice(src.indexOf("const xprice = React.useMemo"), src.indexOf("const valueOf ="));
  assert.match(xp, /lastSeasonPoints/, "x£ is built from last season's points");
  assert.ok(!/gwCount/.test(xp), "and does not read the slider");
});

test("the old filter set is gone", () => {
  const src = readFileSync("app/players/page.jsx", "utf8");
  for (const gone of ["ownRange", "runRange", "rotation", "promoted", "diffs", "DIFFERENTIALS", "CLEAR ALL", "Fixture run"]) {
    assert.ok(!src.includes(gone), `${gone} should have been removed`);
  }
});
