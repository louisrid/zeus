// Defensive contribution data, and the two columns built on it.
//
// The trap here is comparing raw totals across positions. A defender counts clearances, blocks,
// interceptions and tackles and needs ten in a match; a midfielder adds ball recoveries and needs
// twelve. A midfielder will therefore always out-total a defender while being no closer to the line.
// DEFCON+ exists so the number on screen already accounts for that.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import DEFCON from "../config/defcon-2026-27.mjs";
import { SORT_KEYS, COL_WIDTH, METRIC_COLOURS, formatMetric } from "../lib/sorting.mjs";

test("thresholds match the FPL rule, and goalkeepers are excluded", () => {
  assert.equal(DEFCON.thresholds.DEF, 10);
  assert.equal(DEFCON.thresholds.MID, 12);
  assert.equal(DEFCON.thresholds.FWD, 12);
  assert.equal(DEFCON.thresholds.GKP, null, "a goalkeeper cannot earn DEFCON at all");
  for (const row of DEFCON.rows.filter((r) => r.position === "GKP")) {
    assert.equal(row.threshold, null, `${row.name} is a keeper and must have no threshold`);
    assert.equal(row.headroom, null, `${row.name} cannot have headroom against a line he cannot reach`);
  }
});

test("every eligible player carries a complete, internally consistent row", () => {
  const eligible = DEFCON.rows.filter((r) => r.position !== "GKP");
  assert.ok(eligible.length > 400, `expected the full outfield set, got ${eligible.length}`);
  for (const r of eligible) {
    const expected = r.cbi + r.tackles + (r.position === "MID" || r.position === "FWD" ? r.recoveries : 0);
    assert.equal(r.actions, expected, `${r.name}: actions must be the sum of the events that count for him`);
    assert.equal(r.threshold, DEFCON.thresholds[r.position]);
    if (r.per90 !== null) {
      assert.ok(r.nineties >= 1, `${r.name}: a rate needs at least one full ninety behind it`);
      // Derived from exact minutes, not from the rounded nineties field, or the check tests its own rounding.
      assert.ok(Math.abs(r.per90 - (r.actions * 90) / r.minutes) < 0.02,
        `${r.name}: per 90 must follow from the totals`);
      assert.ok(Math.abs(r.headroom - (r.per90 - r.threshold)) < 0.02,
        `${r.name}: headroom is the rate minus the line and nothing else`);
    } else {
      assert.equal(r.headroom, null, `${r.name}: no rate means no headroom, not a zero`);
    }
  }
});

test("a thin sample reports no rate at all", () => {
  /* Nelson made 23 actions in 118 minutes off the bench. At one-full-ninety that read as 17.5 per ninety
     and ranked him first in the league, above every recognised defensive midfielder. The floor is the
     standard the public tools use: 600 minutes and 5 starts. */
  assert.equal(DEFCON.minimum_minutes, 600);
  assert.equal(DEFCON.minimum_starts, 5);
  for (const r of DEFCON.rows) {
    const qualifies = r.position !== "GKP" && r.minutes >= 600 && r.starts >= 5;
    assert.equal(r.qualified, qualifies, `${r.name}: qualification must follow the stated floor`);
    if (!qualifies) {
      assert.equal(r.per90, null, `${r.name} (${r.minutes} mins, ${r.starts} starts) must report no rate`);
      assert.equal(r.headroom, null, `${r.name} must report no margin either`);
    }
  }
  const rated = DEFCON.rows.filter((r) => r.per90 !== null);
  assert.ok(rated.length > 200 && rated.length < 400, `expected a sane qualified pool, got ${rated.length}`);
  for (const r of rated) {
    assert.ok(r.minutes >= 600 && r.starts >= 5, `${r.name} should not have a rate`);
  }
  // The leader must be someone with a real season behind him, not a substitute.
  const top = [...rated].sort((a, b) => b.per90 - a.per90)[0];
  assert.ok(top.minutes >= 1500, `${top.name} leads on ${top.minutes} minutes, which is too thin to lead`);
});

test("the FIT status is gone from the table", () => {
  const table = readFileSync("app/players/page.jsx", "utf8");
  assert.doesNotMatch(table, /key: "STATUS"/, "a column reading FIT on almost every row earns no width");
  assert.doesNotMatch(table, /<Status p=\{p\} \/>/, "and its cell must go with it");
  assert.doesNotMatch(table, /WarnFlag/, "and no flag stands in for it either");
});

test("one DEFCON column, and it fits the table", () => {
  const keys = SORT_KEYS.map((k) => k.key);
  assert.equal(keys.filter((k) => k.startsWith("DEFCON")).length, 1,
    "two columns said the same thing twice and pushed the table off screen");
  const total = Object.values(COL_WIDTH).reduce((sum, w) => sum + parseInt(w, 10), 0);
  assert.ok(total <= 900, `metric columns total ${total}px, which will clip on a laptop`);
});

test("position changes are flagged, because they move the goalposts", () => {
  const moved = DEFCON.rows.filter((r) => r.position_changed);
  assert.ok(moved.length > 0, "reclassified players exist and must be visible");
  for (const r of moved) {
    assert.notEqual(r.actions, r.actions_recorded,
      `${r.name} is flagged as moved, so his recomputed total must differ from what FPL recorded`);
    assert.notEqual(r.position, "GKP");
  }
});

test("the two columns are wired the whole way through", () => {
  const keys = SORT_KEYS.map((k) => k.key);
  assert.ok(keys.includes("DEFCON"), "DEFCON must be sortable");
  for (const key of ["DEFCON"]) {
    assert.ok(COL_WIDTH[key], `${key} needs a column width or the grid breaks`);
    assert.match(METRIC_COLOURS[key], /^#[0-9A-F]{6}$/i, `${key} needs a colour`);
  }
  assert.equal(formatMetric("DEFCON", 15.78), "15.8");
  assert.equal(formatMetric("DEFCON", null), "—", "an absent rate shows a dash, never a zero");
});

test("the leaders are midfielders, and the defenders sit lower on a lower line", () => {
  const rated = DEFCON.rows.filter((r) => r.per90 !== null && r.nineties >= 10);
  const top = [...rated].sort((a, b) => b.per90 - a.per90)[0];
  assert.ok(top.per90 > top.threshold, `${top.name} leads the rate and must clear his own line`);
  const bestDef = [...rated].filter((r) => r.position === "DEF").sort((a, b) => b.headroom - a.headroom)[0];
  assert.ok(bestDef.headroom > 0, "the best defender must clear the defender line");
  // Raw rate would rank the midfielder above; headroom is what makes them comparable.
  assert.ok(bestDef.threshold < top.threshold, "the defender line is genuinely lower");
});

test("DEFCON reaches both surfaces, not just the table", () => {
  const table = readFileSync("app/players/page.jsx", "utf8");
  const detail = readFileSync("app/player/[id]/PlayerPage.jsx", "utf8");

  assert.match(table, /defcon-2026-27/, "the players table must read the DEFCON data");
  assert.match(detail, /defcon-2026-27/,
    "a rate and a margin are all a table can carry; the breakdown belongs on the player page");

  // The player page must show the components, not just repeat the two table figures.
  for (const field of ["cbi", "tackles", "recoveries", "nineties", "threshold", "headroom"]) {
    assert.ok(detail.includes(`defcon.${field}`), `the player page must surface ${field}`);
  }
  assert.match(detail, /position_changed/, "a reclassified player must be told apart on his own page");
  assert.match(detail, /position !== "GKP"/, "keepers cannot earn DEFCON and must not be shown a section");
});

test("the colour carries the threshold, since the rate alone cannot", () => {
  const table = readFileSync("app/players/page.jsx", "utf8");
  assert.match(table, /defconColour/, "the DEFCON cell must be coloured by value, not by column");
  assert.match(table, /headroom <= 0\) return "#FFFFFF"/,
    "falling short is white; pink reads as a warning and most of the league does not clear the line");
  assert.match(table, /return T\.green;/, "only clearing the threshold is coloured");
  assert.match(table, /c\.key === "DEFCON" \? defconColour\(p\)/,
    "and only the DEFCON column may do this");
});
