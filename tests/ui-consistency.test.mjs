import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { numericRangeOptions, rangeWithMin, rangeWithMax } from "../lib/range-options.mjs";
import {
  EXTERNAL_XPTS_GW_FROM,
  EXTERNAL_XPTS_GW_TO,
  EXTERNAL_XPTS_GAMEWEEKS,
} from "../lib/external_xpts.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("price and ownership dropdown options are exact", () => {
  assert.deepEqual(numericRangeOptions(4, 6, 0.5), [4, 4.5, 5, 5.5, 6]);
  assert.deepEqual(numericRangeOptions(0, 100, 5), Array.from({ length: 21 }, (_, index) => index * 5));
  assert.deepEqual(rangeWithMin([4, 8], 9), [9, 9]);
  assert.deepEqual(rangeWithMax([8, 12], 7), [7, 7]);
});

test("player filters use dropdowns and contain no range sliders", () => {
  const controls = read("components/PlayerControls.jsx");
  /* No sliders remains the rule. The price range is now typed in tenths rather than picked in halves,
     because FPL prices move in tenths and a half-million dropdown could not express 4.6 at all. The
     bounds round to tenths for the same reason. */
  assert.equal(controls.includes('type="range"'), false);
  assert.match(controls, /step=\{0\.1\}/);
  assert.match(controls, /step=\{5\}/);
  assert.match(controls, /dropdown-ranges-v1/);

  const players = read("app/players/page.jsx");
  const candidates = read("components/Candidates.jsx");
  assert.match(players, /Math\.floor\(Math\.min\(\.\.\.ps\) \* 10\) \/ 10/);
  assert.match(candidates, /Math\.floor\(Math\.min\(\.\.\.ps\) \* 10\) \/ 10/);
  assert.match(players, /ownershipBounds = React\.useMemo\(\(\) => \[0, 100\], \[\]\)/);
});

test("every squad bench uses the shared compact bench card", () => {
  const dashboardPitch = read("components/Pitch.jsx");
  const builderPitch = read("components/BuilderPitch.jsx");
  const benchCard = read("components/BenchPlayerCard.jsx");
  const css = read("app/globals.css");

  assert.match(dashboardPitch, /BenchPlayerCard/);
  assert.match(builderPitch, /BenchPlayerCard/);
  assert.match(benchCard, /PlayerPlate/);
  assert.match(benchCard, /size="xs"/);
  assert.match(css, /grid-template-columns: auto repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.zeus-bench-card/);
});

test("dashboard template refreshes while fixture widget stays removed", () => {
  const dashboard = read("app/page.jsx");
  assert.equal(dashboard.includes("FixtureOutlook"), false);
  assert.equal(dashboard.includes("Easiest fixtures ahead"), false);
  /* The call now also takes the scorer, so the eleven and the armband are chosen on expected points
     rather than ownership. What this line exists to prove is that the dashboard still recomputes the
     template from the live player list, so the argument list is left open. */
  assert.match(dashboard, /templateSquad\(core\.players\b/);
  assert.match(dashboard, /window\.setInterval/);
  assert.match(dashboard, /range-select-bench-v1/);
});

test("fixture API and external xPTS contract remain present", () => {
  const brief = read("lib/server/fpl_brief_api.mjs");
  const external = read("lib/external_xpts.mjs");
  assert.match(brief, /fixtures/);
  assert.match(brief, /available_gameweeks/);
  assert.match(external, /buildExternalProjectionModel/);
  assert.equal(EXTERNAL_XPTS_GW_FROM, 1);
  assert.ok(EXTERNAL_XPTS_GW_TO >= 1 && EXTERNAL_XPTS_GW_TO <= 38,
    "the served horizon is a config value and moves with each import, so only its bounds are pinned");
  // The list is derived from the horizon, so it is checked against the horizon rather than written out.
  assert.deepEqual(
    EXTERNAL_XPTS_GAMEWEEKS,
    Array.from({ length: EXTERNAL_XPTS_GW_TO - EXTERNAL_XPTS_GW_FROM + 1 }, (_, i) => EXTERNAL_XPTS_GW_FROM + i),
    "the served gameweeks must be exactly the window the horizon describes, with no gaps",
  );
});
