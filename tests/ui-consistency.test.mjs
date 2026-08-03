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
  assert.equal(controls.includes('type="range"'), false);
  assert.match(controls, /step=\{0\.5\}/);
  assert.match(controls, /step=\{5\}/);
  assert.match(controls, /dropdown-ranges-v1/);

  const players = read("app/players/page.jsx");
  const candidates = read("components/Candidates.jsx");
  assert.match(players, /Math\.floor\(Math\.min\(\.\.\.ps\) \* 2\) \/ 2/);
  assert.match(candidates, /Math\.floor\(Math\.min\(\.\.\.ps\) \* 2\) \/ 2/);
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
  assert.match(dashboard, /templateSquad\(core\.players\)/);
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
  assert.equal(EXTERNAL_XPTS_GW_TO, 8);
  assert.deepEqual(EXTERNAL_XPTS_GAMEWEEKS, [1, 2, 3, 4, 5, 6, 7, 8]);
});
